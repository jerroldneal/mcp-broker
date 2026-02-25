/**
 * MCP Broker-Client SDK
 *
 * Connect to a broker, publish tools, and handle incoming calls.
 *
 * Usage:
 *   import { BrokerClient } from './sdk.js';
 *
 *   const rc = new BrokerClient('my-agent', { url: 'ws://localhost:3099' });
 *
 *   rc.addTool({
 *     name: 'greet',
 *     description: 'Say hello',
 *     inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
 *     handler: async ({ name }) => `Hello, ${name}!`,
 *   });
 *
 *   await rc.connect();
 */

import WebSocket from 'ws';
import crypto from 'crypto';

const DEFAULT_URL = 'ws://localhost:3099';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const CHAT_TIMEOUT_MS = 120_000;

export class BrokerClient {
  /**
   * @param {string} clientId — unique identifier for this broker-client
   * @param {object} [options]
   * @param {string} [options.url] — WebSocket URL of the broker
   * @param {boolean} [options.autoReconnect] — reconnect on disconnect (default: true)
   */
  constructor(clientId, options = {}) {
    this.clientId = clientId;
    this.url = options.url || DEFAULT_URL;
    this.autoReconnect = options.autoReconnect !== false;
    this._tools = new Map();       // name → { description, inputSchema, handler }
    this._pendingChats = new Map(); // requestId → { resolve, reject, timer }
    this._ws = null;
    this._registered = false;
    this._reconnectDelay = RECONNECT_DELAY_MS;
    this._closed = false;
  }

  /**
   * Register a tool before or after connecting.
   * If already connected, re-registers with the server.
   */
  addTool({ name, description, inputSchema, handler }) {
    if (!name || typeof handler !== 'function') {
      throw new Error('Tool must have a name and handler function');
    }
    this._tools.set(name, {
      description: description || '',
      inputSchema: inputSchema || { type: 'object', properties: {} },
      handler,
    });
    // Re-register if already connected
    if (this._registered && this._ws?.readyState === WebSocket.OPEN) {
      this._sendRegister();
    }
  }

  /**
   * Connect to the broker and register tools.
   * Resolves once registered.
   */
  connect() {
    this._closed = false;
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this.url);

      this._ws.on('open', () => {
        this._reconnectDelay = RECONNECT_DELAY_MS;
        this._sendRegister();
      });

      this._ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        this._handleMessage(msg, resolve, reject);
      });

      this._ws.on('close', () => {
        this._registered = false;
        if (!this._closed && this.autoReconnect) {
          this._log(`Disconnected. Reconnecting in ${this._reconnectDelay}ms...`);
          setTimeout(() => {
            if (!this._closed) this.connect().catch(() => {});
          }, this._reconnectDelay);
          this._reconnectDelay = Math.min(this._reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
        }
      });

      this._ws.on('error', (err) => {
        this._log(`WebSocket error: ${err.message}`);
        if (!this._registered) reject(err);
      });
    });
  }

  /**
   * Disconnect from the server.
   */
  disconnect() {
    this._closed = true;
    // Reject any pending chat requests
    for (const [id, pending] of this._pendingChats) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnected'));
    }
    this._pendingChats.clear();
    if (this._ws) {
      if (this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({ type: 'unregister' }));
      }
      this._ws.close();
      this._ws = null;
    }
    this._registered = false;
  }

  /**
   * Send a chat request through the broker.
   * Follows Ollama /api/chat format: { model, messages, ... }
   * The server proxies this to the configured Ollama backend.
   *
   * @param {object} payload — Ollama chat payload (model, messages, etc.)
   * @param {object} [options]
   * @param {number} [options.timeout] — timeout in ms (default: 60000)
   * @returns {Promise<object>} — Ollama chat response ({ message, ... })
   */
  chat(payload, options = {}) {
    if (!this._registered || !this._ws || this._ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected to broker'));
    }

    const requestId = crypto.randomBytes(8).toString('hex');
    const timeout = options.timeout || CHAT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingChats.delete(requestId);
        reject(new Error(`Chat request timed out after ${timeout}ms`));
      }, timeout);

      this._pendingChats.set(requestId, { resolve, reject, timer });

      this._ws.send(JSON.stringify({
        type: 'chat_request',
        requestId,
        payload: payload || {},
      }));
    });
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  _sendRegister() {
    const tools = [];
    for (const [name, t] of this._tools) {
      tools.push({ name, description: t.description, inputSchema: t.inputSchema });
    }
    this._ws.send(JSON.stringify({
      type: 'register',
      clientId: this.clientId,
      tools,
    }));
  }

  _handleMessage(msg, resolveConnect, rejectConnect) {
    switch (msg.type) {
      case 'registered':
        this._registered = true;
        this._log(`Registered as "${msg.clientId}" with ${this._tools.size} tool(s)`);
        if (resolveConnect) resolveConnect();
        break;

      case 'error':
        this._log(`Server error: ${msg.message}`);
        if (!this._registered && rejectConnect) {
          rejectConnect(new Error(msg.message));
        }
        break;

      case 'tool_call':
        this._handleToolCall(msg);
        break;

      case 'chat_response': {
        const pending = this._pendingChats.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this._pendingChats.delete(msg.requestId);
          pending.resolve(msg.payload);
        }
        break;
      }

      case 'chat_error': {
        const pending = this._pendingChats.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this._pendingChats.delete(msg.requestId);
          pending.reject(new Error(msg.error || 'Chat request failed'));
        }
        break;
      }
    }
  }

  async _handleToolCall(msg) {
    const { callId, tool, arguments: args } = msg;
    const entry = this._tools.get(tool);

    if (!entry) {
      this._sendResult(callId, [{ type: 'text', text: `Unknown tool: ${tool}` }], true);
      return;
    }

    try {
      const result = await entry.handler(args || {});
      // Normalize result to MCP content array
      const content = typeof result === 'string'
        ? [{ type: 'text', text: result }]
        : Array.isArray(result)
          ? result
          : [{ type: 'text', text: JSON.stringify(result) }];
      this._sendResult(callId, content, false);
    } catch (err) {
      this._sendResult(callId, [{ type: 'text', text: `Error: ${err.message}` }], true);
    }
  }

  _sendResult(callId, content, isError) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'tool_result', callId, content, isError }));
    }
  }

  _log(msg) {
    process.stderr.write(`[broker-client:${this.clientId}] ${msg}\n`);
  }
}
