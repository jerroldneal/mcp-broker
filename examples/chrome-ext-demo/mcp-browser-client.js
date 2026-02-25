/**
 * MCP Client for the browser (Streamable HTTP transport)
 *
 * Connects to an MCP server's Streamable HTTP endpoint via fetch POST.
 * Each request is a standalone JSON-RPC round-trip — no SSE or long-lived
 * connections needed. Works with the stateless Streamable HTTP server.
 *
 * Usage:
 *   const client = new McpBrowserClient('http://localhost:3098/mcp');
 *   await client.connect();
 *   const tools = await client.listTools();
 *   const result = await client.callTool('hello-world__greet', { name: 'Sam' });
 *   client.close();
 */
class McpBrowserClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this._requestId = 0;
    this._ready = false;
    this._serverInfo = null;
  }

  /** Initialize the MCP session. Must call before listTools / callTool. */
  async connect() {
    const initResult = await this._send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-browser-client', version: '2.0.0' },
    });

    // Fire-and-forget initialized notification
    await this._post({ jsonrpc: '2.0', method: 'notifications/initialized' });

    this._serverInfo = initResult.result;
    this._ready = true;
    return initResult;
  }

  /** List all available tools from the server. */
  async listTools() {
    if (!this._ready) throw new Error('Client not connected');
    const result = await this._send('tools/list', {});
    if (result.error) throw new Error(result.error.message || 'listTools failed');
    return result.result.tools || [];
  }

  /** Call a tool by name with optional arguments. */
  async callTool(name, args) {
    if (!this._ready) throw new Error('Client not connected');
    const result = await this._send('tools/call', { name, arguments: args || {} });
    if (result.error) throw new Error(result.error.message || 'Tool call failed');
    return result.result;
  }

  /** Send a JSON-RPC request and return the parsed response. */
  async _send(method, params) {
    const id = ++this._requestId;
    const body = { jsonrpc: '2.0', id, method, params };
    const res = await fetch(this.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      // Parse SSE response to extract JSON-RPC message
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try { return JSON.parse(data); } catch {}
        }
      }
      throw new Error('No valid JSON-RPC message in SSE response');
    }
    return await res.json();
  }

  /** Post a notification (no response expected). */
  async _post(body) {
    await fetch(this.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
    });
  }

  close() {
    this._ready = false;
    this._serverInfo = null;
  }

  /** Quick health check — can we reach the server? */
  static async ping(serverUrl) {
    try {
      const res = await fetch(serverUrl, { method: 'GET' });
      // Server returns 405 for GET (expected) — means it's alive
      return res.status === 405 || res.ok;
    } catch {
      return false;
    }
  }
}
