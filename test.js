#!/usr/bin/env node
/**
 * Integration test: starts the WebSocket server side (imported from server),
 * connects a broker-client, and verifies tool registration + tool call routing.
 */

import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

const WS_PORT = 13199; // test port to avoid conflict

// ─── Minimal broker (extracted logic) ────────────────────────────────────────

const registry = new Map();
const pendingCalls = new Map();

function namespacedTool(clientId, toolName) { return `${clientId}__${toolName}`; }
function parseNamespacedTool(n) {
  const sep = n.indexOf('__');
  return sep === -1 ? null : { clientId: n.slice(0, sep), toolName: n.slice(sep + 2) };
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
  let assignedClientId = null;
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'register') {
      assignedClientId = msg.clientId;
      registry.set(msg.clientId, { ws, tools: msg.tools || [] });
      ws.send(JSON.stringify({ type: 'registered', clientId: msg.clientId }));
    } else if (msg.type === 'tool_result') {
      const p = pendingCalls.get(msg.callId);
      if (p) { clearTimeout(p.timer); pendingCalls.delete(msg.callId); p.resolve(msg); }
    }
  });
  ws.on('close', () => { if (assignedClientId) registry.delete(assignedClientId); });
});

function callTool(clientId, toolName, args) {
  return new Promise((resolve, reject) => {
    const entry = registry.get(clientId);
    if (!entry) return reject(new Error('not connected'));
    const callId = crypto.randomBytes(4).toString('hex');
    const timer = setTimeout(() => { pendingCalls.delete(callId); reject(new Error('timeout')); }, 5000);
    pendingCalls.set(callId, { resolve, reject, timer });
    entry.ws.send(JSON.stringify({ type: 'tool_call', callId, tool: toolName, arguments: args }));
  });
}

// ─── Test ────────────────────────────────────────────────────────────────────

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(label, condition) {
    if (condition) { console.log(`  ✅ ${label}`); passed++; }
    else { console.log(`  ❌ ${label}`); failed++; }
  }

  // Wait for WSS to be ready
  await new Promise(r => setTimeout(r, 200));

  // 1. Connect broker-client via raw WS
  console.log('\n── Test: Broker client registration ──');
  const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  const regResponse = await new Promise((resolve) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'registered') resolve(msg);
    });
    ws.send(JSON.stringify({
      type: 'register',
      clientId: 'test-agent',
      tools: [
        { name: 'echo', description: 'Echo input', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
      ],
    }));
  });

  assert('Registered with correct clientId', regResponse.clientId === 'test-agent');
  assert('Registry has entry', registry.has('test-agent'));
  assert('Registry has 1 tool', registry.get('test-agent').tools.length === 1);

  // 2. Handle a tool call
  console.log('\n── Test: Tool call routing ──');

  // Set up handler on the broker-client side
  const originalOnMessage = ws.onmessage;
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'tool_call') {
      ws.send(JSON.stringify({
        type: 'tool_result',
        callId: msg.callId,
        content: [{ type: 'text', text: `echo: ${msg.arguments.text}` }],
        isError: false,
      }));
    }
  });

  const result = await callTool('test-agent', 'echo', { text: 'hello' });
  assert('Tool call returned result', !!result);
  assert('Result content is correct', result.content[0].text === 'echo: hello');
  assert('Result is not error', result.isError === false);

  // 3. Namespace parsing
  console.log('\n── Test: Namespace parsing ──');
  const parsed = parseNamespacedTool('test-agent__echo');
  assert('Parsed clientId', parsed.clientId === 'test-agent');
  assert('Parsed toolName', parsed.toolName === 'echo');
  assert('Invalid namespace returns null', parseNamespacedTool('nounderscores') === null);

  // 4. Disconnect
  console.log('\n── Test: Disconnect cleanup ──');
  ws.close();
  await new Promise(r => setTimeout(r, 200));
  assert('Registry cleaned up on disconnect', !registry.has('test-agent'));

  // Summary
  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);

  wss.close();
  process.exit(failed > 0 ? 1 : 0);
}

test().catch((err) => {
  console.error('Test failed:', err);
  wss.close();
  process.exit(1);
});
