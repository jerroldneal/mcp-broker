/**
 * ToolProvider — Composable base class for publishing tools via the broker.
 *
 * Subclasses define tools by overriding `defineTools()`, returning an array of
 * tool descriptors. The base class wires them into the BrokerClient SDK.
 *
 * Usage:
 *   class MyService extends ToolProvider {
 *     defineTools() {
 *       return [
 *         {
 *           name: 'greet',
 *           description: 'Say hello',
 *           inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
 *           handler: async ({ name }) => `Hello, ${name}!`,
 *         },
 *       ];
 *     }
 *   }
 *
 *   const svc = new MyService('my-service');
 *   await svc.start();
 */

import { BrokerClient } from './sdk.js';

export class ToolProvider {
  /**
   * @param {string} clientId — unique identifier for this broker-client
   * @param {object} [options]
   * @param {string} [options.url] — WebSocket URL (default: ws://localhost:3099)
   * @param {boolean} [options.autoReconnect] — reconnect on disconnect (default: true)
   */
  constructor(clientId, options = {}) {
    this.clientId = clientId;
    this._rc = new BrokerClient(clientId, options);
    this._started = false;

    // Register tools from subclass
    for (const tool of this.defineTools()) {
      this._rc.addTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        handler: tool.handler.bind(this),
      });
    }
  }

  /**
   * Override in subclass. Return an array of tool definitions:
   *   [{ name, description, inputSchema?, handler }]
   *
   * Handlers are bound to `this` (the ToolProvider instance), so they
   * can access instance state freely.
   */
  defineTools() {
    return [];
  }

  /**
   * Connect to the broker and register all tools.
   */
  async start() {
    await this._rc.connect();
    this._started = true;
    this._log(`started with ${this.defineTools().length} tool(s)`);
  }

  /**
   * Disconnect from the broker.
   */
  stop() {
    this._rc.disconnect();
    this._started = false;
    this._log('stopped');
  }

  /**
   * Send a chat request through the broker AI proxy.
   */
  chat(payload, options) {
    return this._rc.chat(payload, options);
  }

  /** @internal */
  _log(msg) {
    console.error(`[${this.clientId}] ${msg}`);
  }
}
