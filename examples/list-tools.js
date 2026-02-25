#!/usr/bin/env node
/**
 * List available MCP tools
 *
 * Connects to the broker, calls list_broker_clients to show
 * connected clients, then lists all available tools with descriptions.
 *
 * Usage:  npm run ls
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3098/mcp';

const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client(
  { name: 'list-tools', version: '1.0.0' },
  { capabilities: {} }
);

try {
  await client.connect(transport);
} catch (err) {
  console.error(`Could not connect to ${MCP_URL} — is the server running?`);
  process.exit(1);
}

// Call list_broker_clients built-in tool
const rc = await client.callTool({ name: 'list_broker_clients', arguments: {} });
const rcText = (rc.content || []).map(c => c.text).join('');
let clients;
try { clients = JSON.parse(rcText); } catch { clients = []; }

console.log('══ Broker-Clients ═══════════════════════════');
if (clients.length === 0) {
  console.log('  (none connected)');
} else {
  for (const c of clients) {
    console.log(`  ● ${c.clientId}  (${c.tools.length} tool${c.tools.length === 1 ? '' : 's'})`);
  }
}

// List all tools
const { tools } = await client.listTools();
console.log(`\n══ Available Tools (${tools.length}) ═══════════════════════`);
if (tools.length === 0) {
  console.log('  (no tools available)');
} else {
  for (const t of tools) {
    console.log(`  ${t.name}`);
    if (t.description) console.log(`    ${t.description}`);
  }
}

await client.close();
