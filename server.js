#!/usr/bin/env node
/**
 * MCP Broker
 *
 * A tool-routing hub for MCP.
 *
 * Two interfaces:
 *   1. Streamable HTTP MCP (port 3098) — normal MCP clients connect here
 *   2. WebSocket server (port 3099) — broker-clients connect here to publish tools
 *
 * Broker clients register tools over WebSocket. Normal MCP clients see the
 * union of all registered tools and can call them transparently.
 *
 * Protocol (WebSocket, JSON messages):
 *   broker-client → server:  { type: "register", clientId, tools }
 *   broker-client → server:  { type: "unregister" }
 *   server → broker-client:  { type: "registered", clientId }
 *   server → broker-client:  { type: "tool_call", callId, tool, arguments }
 *   broker-client → server:  { type: "tool_result", callId, content, isError }
 *   broker-client → server:  { type: "chat_request", requestId, payload }
 *   server → broker-client:  { type: "chat_response", requestId, payload }
 *   server → broker-client:  { type: "chat_error", requestId, error }
 *   broker-client → server:  { type: "notification", event }
 *   server → broker-client:  { type: "notification_ack", timestamp }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer } from 'ws';
import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateClientDashboard } from './client-dashboard.js';
import { BrokerClient } from '../mcp-broker-client/sdk.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const WS_PORT = parseInt(process.env.BROKER_WS_PORT || '3099', 10);
const HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT || '3098', 10);
const TOOL_CALL_TIMEOUT_MS = 300_000;
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:14b';
const ACTIVITY_LOG_MAX = 200;
const NOTIFICATION_MAX_PER_CLIENT = 100;
const NOTIFICATION_MAX_GLOBAL = 500;

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Map of clientId → { ws, tools: [{ name, description, inputSchema }], connectedAt }
 */
const registry = new Map();

/**
 * Pending tool calls awaiting results.
 * Map of callId → { resolve, reject, timer }
 */
const pendingCalls = new Map();

// ─── Dashboard State ─────────────────────────────────────────────────────────

const serverStartedAt = Date.now();
const stats = { toolCalls: 0, toolErrors: 0, chatRequests: 0, chatErrors: 0, totalConnections: 0, notifications: 0 };
const activityLog = []; // { time, type, message, data? }
const sseClients = new Set();

// ─── Notification Storage ────────────────────────────────────────────────────

/** Per-client notification ring buffer: clientId → [notification] */
const clientNotifications = new Map();
/** Global notification ring buffer */
const globalNotifications = [];

function storeNotification(clientId, notification) {
  // Per-client buffer
  if (!clientNotifications.has(clientId)) clientNotifications.set(clientId, []);
  const buf = clientNotifications.get(clientId);
  buf.push(notification);
  if (buf.length > NOTIFICATION_MAX_PER_CLIENT) buf.shift();
  // Global buffer
  globalNotifications.push(notification);
  if (globalNotifications.length > NOTIFICATION_MAX_GLOBAL) globalNotifications.shift();
}

function clearClientNotifications(clientId) {
  clientNotifications.delete(clientId);
}

function getNotifications(clientId, limit = 50) {
  const source = clientId ? (clientNotifications.get(clientId) || []) : globalNotifications;
  return source.slice(-limit);
}

function broadcastNotification(notification) {
  for (const res of sseClients) {
    res.write(`data: ${JSON.stringify({ type: 'notification', ...notification })}\n\n`);
  }
}

function addActivity(type, message, data) {
  const entry = { time: new Date().toISOString(), type, message };
  if (data) entry.data = data;
  activityLog.push(entry);
  if (activityLog.length > ACTIVITY_LOG_MAX) activityLog.shift();
  // Broadcast to SSE clients
  for (const res of sseClients) {
    res.write(`data: ${JSON.stringify({ type: 'activity', entry })}\n\n`);
  }
}

function broadcastState() {
  const snapshot = buildStatusSnapshot();
  for (const res of sseClients) {
    res.write(`data: ${JSON.stringify({ type: 'state', ...snapshot })}\n\n`);
  }
}

function buildStatusSnapshot() {
  const clients = [];
  for (const [clientId, entry] of registry) {
    clients.push({
      clientId,
      connectedAt: entry.connectedAt,
      tools: entry.tools.map(t => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema || { type: 'object', properties: {} } })),
    });
  }
  return {
    uptime: Date.now() - serverStartedAt,
    startedAt: new Date(serverStartedAt).toISOString(),
    connectedClients: registry.size,
    totalTools: clients.reduce((sum, c) => sum + c.tools.length, 0),
    stats: { ...stats },
    clients,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function namespacedTool(clientId, toolName) {
  return `${clientId}__${toolName}`;
}

function parseNamespacedTool(namespacedName) {
  const sep = namespacedName.indexOf('__');
  if (sep === -1) return null;
  return {
    clientId: namespacedName.slice(0, sep),
    toolName: namespacedName.slice(sep + 2),
  };
}

function log(msg) {
  process.stderr.write(`[broker] ${msg}\n`);
}

// ─── WebSocket Server (broker-client side) ──────────────────────────────────

const wsHttpServer = http.createServer((_req, res) => {
  res.writeHead(302, { Location: `http://localhost:${HTTP_PORT}/` });
  res.end();
});
wsHttpServer.listen(WS_PORT);
const wss = new WebSocketServer({ server: wsHttpServer });
log(`WebSocket server listening on port ${WS_PORT}`);

wss.on('connection', (ws) => {
  let assignedClientId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'register': {
        // Validate
        const clientId = typeof msg.clientId === 'string' && msg.clientId.length > 0
          ? msg.clientId.replace(/[^a-zA-Z0-9_-]/g, '_')
          : `rc_${crypto.randomBytes(4).toString('hex')}`;

        if (registry.has(clientId)) {
          const old = registry.get(clientId);
          log(`Replacing stale broker-client "${clientId}" (reconnect)`);
          try { old.ws.close(1000, 'Replaced by new connection'); } catch {}
          registry.delete(clientId);
          addActivity('disconnect', `"${clientId}" replaced by reconnect`, { clientId });
        }

        const tools = Array.isArray(msg.tools) ? msg.tools : [];
        assignedClientId = clientId;
        registry.set(clientId, { ws, tools, connectedAt: new Date().toISOString() });
        stats.totalConnections++;
        log(`Registered broker-client "${clientId}" with ${tools.length} tool(s)`);
        addActivity('connect', `"${clientId}" registered with ${tools.length} tool(s)`, { clientId, tools: tools.map(t => t.name) });
        broadcastState();
        ws.send(JSON.stringify({ type: 'registered', clientId, dashboardUrl: `http://localhost:${HTTP_PORT}/client/${clientId}` }));
        break;
      }

      case 'unregister': {
        if (assignedClientId && registry.has(assignedClientId)) {
          registry.delete(assignedClientId);
          log(`Unregistered broker-client "${assignedClientId}"`);
          addActivity('disconnect', `"${assignedClientId}" unregistered`, { clientId: assignedClientId });
          broadcastState();
          assignedClientId = null;
        }
        break;
      }

      case 'tool_result': {
        const pending = pendingCalls.get(msg.callId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingCalls.delete(msg.callId);
          pending.resolve({
            content: msg.content || [{ type: 'text', text: 'No content returned' }],
            isError: msg.isError || false,
          });
        }
        break;
      }

      case 'chat_request': {
        if (!msg.requestId || !msg.payload) {
          ws.send(JSON.stringify({ type: 'error', message: 'chat_request requires requestId and payload' }));
          break;
        }
        stats.chatRequests++;
        log(`Chat request from "${assignedClientId}" (model: ${msg.payload.model || 'default'})`);
        addActivity('chat', `Chat request from "${assignedClientId}" (model: ${msg.payload.model || 'default'})`, { clientId: assignedClientId, model: msg.payload.model });
        proxyChat(ws, msg.requestId, msg.payload);
        break;
      }

      case 'notification': {
        if (!assignedClientId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Must register before sending notifications' }));
          break;
        }
        const event = msg.event || msg.data || {};
        const notification = {
          clientId: assignedClientId,
          event,
          timestamp: new Date().toISOString()
        };
        stats.notifications++;
        storeNotification(assignedClientId, notification);
        addActivity('notification', `${assignedClientId}: ${event.type || 'event'}`, { clientId: assignedClientId, event });
        broadcastNotification(notification);
        ws.send(JSON.stringify({ type: 'notification_ack', timestamp: notification.timestamp }));
        break;
      }

      case 'call_tool': {
        // Broker-client requesting to call a tool (built-in or on another client)
        const callId = msg.callId || crypto.randomBytes(8).toString('hex');
        const toolName = msg.tool;
        const toolArgs = msg.arguments || {};
        if (!toolName) {
          ws.send(JSON.stringify({ type: 'call_tool_result', callId, content: [{ type: 'text', text: 'tool name is required' }], isError: true }));
          break;
        }
        (async () => {
          try {
            stats.toolCalls++;
            addActivity('tool_call', `${assignedClientId} → ${toolName}`, { clientId: assignedClientId, tool: toolName, args: toolArgs });
            const result = await routeToolCall(toolName, toolArgs);
            addActivity('tool_result', `${toolName} returned`, { clientId: assignedClientId, tool: toolName, isError: result.isError });
            if (result.isError) stats.toolErrors++;
            ws.send(JSON.stringify({ type: 'call_tool_result', callId, content: result.content, isError: result.isError || false }));
          } catch (err) {
            stats.toolErrors++;
            addActivity('tool_error', `${toolName} failed: ${err.message}`, { clientId: assignedClientId, tool: toolName });
            ws.send(JSON.stringify({ type: 'call_tool_result', callId, content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }));
          }
        })();
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    if (assignedClientId && registry.has(assignedClientId)) {
      registry.delete(assignedClientId);
      clearClientNotifications(assignedClientId);
      log(`Broker client "${assignedClientId}" disconnected`);
      addActivity('disconnect', `"${assignedClientId}" disconnected`, { clientId: assignedClientId });
      broadcastState();
    }
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
  });
});

// ─── Chat Proxy (Ollama MCP Server) ──────────────────────────────────────────

async function proxyChat(ws, requestId, payload) {
  try {
    const messages = payload.messages || [];
    const systemMsg = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');
    const prompt = userMessages.map(m => m.content).join('\n') || payload.prompt || '';

    const text = await ollamaGenerate(prompt, {
      model: payload.model || DEFAULT_MODEL,
      system: systemMsg?.content,
    });

    ws.send(JSON.stringify({
      type: 'chat_response',
      requestId,
      payload: {
        message: { role: 'assistant', content: text },
        model: payload.model || DEFAULT_MODEL,
      },
    }));
  } catch (err) {
    stats.chatErrors++;
    addActivity('chat_error', `Chat proxy failed: ${err.message}`);
    ws.send(JSON.stringify({
      type: 'chat_error',
      requestId,
      error: `Ollama MCP proxy failed: ${err.message}`,
    }));
  }
}

// ─── Direct Ollama REST API ──────────────────────────────────────────────────

/**
 * Direct Ollama REST API call — bypasses MCP intermediary.
 * Returns the response text from Ollama.
 */
async function ollamaGenerate(prompt, { model, system } = {}) {
  const res = await fetch(`${OLLAMA_API_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || DEFAULT_MODEL, prompt, system, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return data.response || '';
}

// ─── Tool Call Router ────────────────────────────────────────────────────────

/**
 * Route a tool call: check built-in tools first, then namespaced client tools.
 * Used by both MCP HTTP and WebSocket call_tool paths.
 */
async function routeToolCall(name, args) {
  // Built-in: list_broker_clients
  if (name === 'list_broker_clients') {
    const clients = [];
    for (const [clientId, entry] of registry) {
      clients.push({ clientId, tools: entry.tools.map(t => t.name) });
    }
    return { content: [{ type: 'text', text: JSON.stringify(clients, null, 2) }], isError: false };
  }

  // Built-in: get_notifications
  if (name === 'get_notifications') {
    const results = getNotifications(args?.clientId, args?.limit);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }], isError: false };
  }

  // Built-in: speak (via kokoro-tts broker-client WebSocket)
  if (name === 'speak') {
    try {
      return await callProviderTool('kokoro-tts', 'speak', args);
    } catch (err) {
      return { content: [{ type: 'text', text: `speak failed: ${err.message}` }], isError: true };
    }
  }

  // Built-in: speak_action (Ollama rephrase → TTS, both via direct HTTP)
  if (name === 'speak_action') {
    const action = args?.action;
    if (!action || typeof action !== 'string') {
      return { content: [{ type: 'text', text: 'action string is required' }], isError: true };
    }
    let spokenText = action;
    try {
      const text = await ollamaGenerate(action, {
        model: 'qwen2.5:3b',
        system: 'You are a poker player announcing your action at the table. Rephrase the given poker action into a short, natural, first-person spoken phrase (5-10 words max). Be varied and casual. Examples: "I\'ll raise to six fifty", "Fold", "Call", "I\'m all in", "Bet four hundred", "I raise eight hundred". Output ONLY the spoken phrase, nothing else. No quotes, no explanation.'
      });
      if (text && text.length > 0 && text.length < 100) spokenText = text.trim();
    } catch (err) {
      log(`speak_action Ollama rephrase failed: ${err.message}, using raw action`);
    }
    try {
      return await callProviderTool('kokoro-tts', 'speak', { text: spokenText });
    } catch (err) {
      return { content: [{ type: 'text', text: `speak failed: ${err.message}` }], isError: true };
    }
  }

  // Built-in: ask_ai (direct HTTP to Ollama MCP, optional TTS)
  if (name === 'ask_ai') {
    const prompt = args?.prompt;
    if (!prompt || typeof prompt !== 'string') {
      return { content: [{ type: 'text', text: 'prompt string is required' }], isError: true };
    }
    try {
      const text = await ollamaGenerate(
        args?.system ? `${args.system}\n\n${prompt}` : prompt,
        { model: args?.model || DEFAULT_MODEL },
      );
      if (args?.speak && text) {
        try {
          await callProviderTool('kokoro-tts', 'speak', { text });
        } catch (speakErr) {
          log(`ask_ai speak failed: ${speakErr.message}`);
        }
      }
      return { content: [{ type: 'text', text: text || '(no response)' }], isError: false };
    } catch (err) {
      log(`ask_ai failed: ${err.message}`);
      return { content: [{ type: 'text', text: `AI error: ${err.message}` }], isError: true };
    }
  }

  // Namespaced: clientId__toolName
  const parsed = parseNamespacedTool(name);
  if (!parsed) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
  return await callProviderTool(parsed.clientId, parsed.toolName, args);
}

function callProviderTool(clientId, toolName, args) {
  return new Promise((resolve, reject) => {
    const entry = registry.get(clientId);
    if (!entry) {
      return reject(new Error(`Broker client "${clientId}" not connected`));
    }

    const callId = crypto.randomBytes(8).toString('hex');

    const timer = setTimeout(() => {
      pendingCalls.delete(callId);
      reject(new Error(`Tool call "${toolName}" on "${clientId}" timed out after ${TOOL_CALL_TIMEOUT_MS}ms`));
    }, TOOL_CALL_TIMEOUT_MS);

    pendingCalls.set(callId, { resolve, reject, timer });

    entry.ws.send(JSON.stringify({
      type: 'tool_call',
      callId,
      tool: toolName,
      arguments: args || {},
    }));
  });
}

// ─── MCP Server Factory (Streamable HTTP side) ──────────────────────────────

// Built-in management tools
const BUILTIN_TOOLS = [
  {
    name: 'list_broker_clients',
    description: 'List all connected broker-clients and their published tools',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_notifications',
    description: 'Get recent notifications from broker-clients, optionally filtered by clientId',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'Filter by client ID (optional)' },
        limit: { type: 'number', description: 'Max notifications to return (default: 50)' },
      },
    },
  },
  {
    name: 'speak',
    description: 'Convert text to speech and play through speakers. Forwards to the kokoro-tts broker-client.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to convert to speech' },
        voice: { type: 'string', description: 'Voice ID (e.g. af_heart, am_adam). Use kokoro-tts__list_voices to see all options.' },
        speed: { type: 'number', description: 'Speed of speech (default: 1.0, range: 0.5-2.0)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'speak_action',
    description: 'Rephrase a poker action into natural speech using AI, then speak it aloud. Use this when announcing game actions.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'The poker action to announce (e.g. "Raise 650", "Fold", "All-In: 5,000")' },
      },
      required: ['action'],
    },
  },
  {
    name: 'ask_ai',
    description: 'Ask the AI a question and get a text response. Optionally speak the answer aloud. Any tiny client can use this for intelligence without local resources.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The question or prompt to send to the AI' },
        system: { type: 'string', description: 'System prompt to guide behavior (optional)' },
        model: { type: 'string', description: `Model to use (default: ${DEFAULT_MODEL})` },
        speak: { type: 'boolean', description: 'Whether to speak the response aloud (default: false)' },
      },
      required: ['prompt'],
    },
  },
];

function createMcpServer() {
  const mcpServer = new Server(
    { name: 'mcp-broker', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [...BUILTIN_TOOLS];

    for (const [clientId, entry] of registry) {
      for (const tool of entry.tools) {
        tools.push({
          name: namespacedTool(clientId, tool.name),
          description: `[${clientId}] ${tool.description || ''}`,
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        });
      }
    }

    return { tools };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      stats.toolCalls++;
      addActivity('tool_call', `${name} called`, { tool: name, args });
      const result = await routeToolCall(name, args);
      addActivity('tool_result', `${name} returned`, { tool: name, isError: result.isError });
      if (result.isError) stats.toolErrors++;
      return result;
    } catch (err) {
      stats.toolErrors++;
      addActivity('tool_error', `${name} failed: ${err.message}`, { tool: name });
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return mcpServer;
}

// ─── Express + Streamable HTTP Transport ─────────────────────────────────────

const app = express();
app.use(express.json());

// CORS — allow Chrome extensions and any localhost origin
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (_req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Stateless: each request gets a fresh Server + Transport pair,
// but they all share the same registry of broker-clients.
app.post('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    log(`MCP HTTP error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
  }
});

app.get('/mcp', (_req, res) => res.status(405).end());
app.delete('/mcp', (_req, res) => res.status(405).end());

// ─── Dashboard API ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'dashboard.html'));
});

app.get('/api/status', (_req, res) => {
  res.json(buildStatusSnapshot());
});

app.get('/api/activity', (_req, res) => {
  res.json(activityLog);
});

app.post('/api/call-tool', async (req, res) => {
  const { clientId, tool, arguments: args } = req.body || {};
  if (!tool) {
    return res.status(400).json({ error: 'tool is required' });
  }
  const start = Date.now();
  try {
    let result;
    const parsed = parseNamespacedTool(tool);
    if (parsed || BUILTIN_TOOLS.some(b => b.name === tool)) {
      // Namespaced tool (e.g. kokoro-tts__preview_voice) or built-in tool:
      // always route through routeToolCall which handles both.
      result = await routeToolCall(tool, args || {});
    } else if (clientId) {
      // Plain tool name with explicit clientId (broker dashboard path):
      // call the tool directly on the specified client.
      const entry = registry.get(clientId);
      if (!entry) {
        return res.status(404).json({ error: `Client "${clientId}" not connected` });
      }
      result = await callProviderTool(clientId, tool, args || {});
    } else {
      return res.status(400).json({ error: `Unknown tool: ${tool}` });
    }
    res.json({ content: result.content, isError: result.isError || false, duration: Date.now() - start });
  } catch (err) {
    res.status(500).json({ error: err.message, duration: Date.now() - start });
  }
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({ type: 'state', ...buildStatusSnapshot() })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ─── Per-Client Dashboard ─────────────────────────────────────────────────────

app.get('/client/:clientId', (req, res) => {
  const { clientId } = req.params;
  const entry = registry.get(clientId);
  const clientData = entry
    ? { tools: entry.tools, connectedAt: entry.connectedAt }
    : { tools: [], connectedAt: '' };

  // Compute available tools: built-in + tools from other connected clients
  const availableTools = [...BUILTIN_TOOLS];
  for (const [cid, e] of registry) {
    if (cid === clientId) continue;
    for (const t of e.tools) {
      availableTools.push({
        name: namespacedTool(cid, t.name),
        description: `[${cid}] ${t.description || ''}`,
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      });
    }
  }

  const html = generateClientDashboard(clientId, clientData, {
    host: req.headers.host || `localhost:${HTTP_PORT}`,
    activityLog,
    notifications: getNotifications(clientId),
    stats,
    availableTools,
  });
  res.type('html').send(html);
});

app.get('/api/client/:clientId/status', (req, res) => {
  const { clientId } = req.params;
  const entry = registry.get(clientId);
  if (!entry) return res.status(404).json({ error: `Client "${clientId}" not connected` });
  res.json({
    clientId,
    connectedAt: entry.connectedAt,
    tools: entry.tools.map(t => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema || {} })),
    notifications: getNotifications(clientId),
    uptime: Date.now() - serverStartedAt,
  });
});

app.get('/api/client/:clientId/activity', (req, res) => {
  const { clientId } = req.params;
  const filtered = activityLog.filter(a => a.data && a.data.clientId === clientId);
  res.json(filtered);
});

app.get('/api/client/:clientId/events', (req, res) => {
  const { clientId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({ type: 'state', ...buildStatusSnapshot() })}\n\n`);

  // Reuse main SSE set — client-side JS filters by clientId
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ─── Speak Action (Ollama rephrase → TTS) ────────────────────────────────────

app.post('/api/speak-action', async (req, res) => {
  const { action } = req.body || {};
  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'action string is required' });
  }

  // Use Ollama to rephrase into natural poker speech
  let spokenText = action;
  try {
    const text = await ollamaGenerate(action, {
      model: 'qwen2.5:3b',
      system: 'You are a poker player announcing your action at the table. Rephrase the given poker action into a short, natural, first-person spoken phrase (5-10 words max). Be varied and casual. Examples: "I\'ll raise to six fifty", "Fold", "Call", "I\'m all in", "Bet four hundred", "I raise eight hundred". Output ONLY the spoken phrase, nothing else. No quotes, no explanation.'
    });
    if (text && text.length > 0 && text.length < 100) spokenText = text.trim();
  } catch (err) {
    log(`speak-action Ollama rephrase failed: ${err.message}, using raw action`);
  }

  // Forward to TTS
  try {
    const ttsResult = await callProviderTool('kokoro-tts', 'speak', { text: spokenText });
    res.json({ spoken: spokenText, tts: ttsResult.content, isError: ttsResult.isError || false });
  } catch (err) {
    res.status(500).json({ error: err.message, spoken: spokenText });
  }
});

// ─── Ask AI Streaming (tokens arrive in real-time) ────────────────────────────

app.post('/api/ask-stream', async (req, res) => {
  const { prompt, model, system, speak } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt string is required' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let fullText = '';
  try {
    const ollamaRes = await fetch(`${OLLAMA_API_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || DEFAULT_MODEL, prompt, system, stream: true }),
    });
    if (!ollamaRes.ok) throw new Error(`Ollama returned ${ollamaRes.status}`);

    // Node 18: ReadableStream is NOT async-iterable, must use getReader()
    const reader = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete last line
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.response) {
            fullText += obj.response;
            res.write(`data: ${JSON.stringify({ token: obj.response })}\n\n`);
          }
          if (obj.done) {
            res.write(`data: ${JSON.stringify({ done: true, fullText })}\n\n`);
          }
        } catch (_) { /* ignore parse errors on partial chunks */ }
      }
    }

    addActivity('chat', `Ask AI stream (model: ${model || 'default'})`, { clientId: 'dashboard', model });

    if (speak && fullText) {
      try {
        await callProviderTool('kokoro-tts', 'speak', { text: fullText });
      } catch (speakErr) {
        log(`ask-stream speak failed: ${speakErr.message}`);
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    log(`ask-stream failed: ${err.message}`);
  }
  res.end();
});

// ─── Chat Test (direct Ollama proxy — same path as WS chat_request) ──────────

app.post('/api/chat', async (req, res) => {
  const { message, model, system } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message string is required' });
  }
  const start = Date.now();
  try {
    const text = await ollamaGenerate(message, { model, system });
    stats.chatRequests++;
    addActivity('chat', `Dashboard chat test (model: ${model || 'default'})`, { clientId: 'dashboard', model });
    res.json({ response: text, model: model || DEFAULT_MODEL, duration: Date.now() - start });
  } catch (err) {
    stats.chatErrors++;
    addActivity('chat_error', `Dashboard chat test failed: ${err.message}`, { clientId: 'dashboard' });
    res.status(500).json({ error: err.message, duration: Date.now() - start });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  app.listen(HTTP_PORT, () => {
    log(`MCP HTTP server listening on http://localhost:${HTTP_PORT}/mcp`);
  });
  log('MCP Broker running (HTTP + WebSocket)');

  // Register the dashboard itself as a broker client
  const dashboard = new BrokerClient('dashboard', {
    url: `ws://localhost:${WS_PORT}`,
    autoReconnect: true,
  });

  dashboard.addTool({
    name: 'get_status',
    description: 'Get broker server status snapshot',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => JSON.stringify(buildStatusSnapshot()),
  });

  dashboard.addTool({
    name: 'list_clients',
    description: 'List all connected broker clients',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const clients = [];
      for (const [id, entry] of registry) {
        clients.push({ clientId: id, tools: entry.tools.length, connectedAt: entry.connectedAt });
      }
      return JSON.stringify(clients);
    },
  });

  dashboard.addTool({
    name: 'get_activity',
    description: 'Get recent activity log entries',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max entries to return (default 20)' } },
    },
    handler: async ({ limit }) => JSON.stringify(activityLog.slice(-(limit || 20))),
  });

  // Small delay to ensure WS server is ready
  setTimeout(() => {
    dashboard.connect().catch(err => log(`Dashboard client connect failed: ${err.message}`));
  }, 500);
}

main().catch((err) => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
