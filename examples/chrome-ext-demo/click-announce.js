#!/usr/bin/env node
/**
 * Click Announce — one-shot MCP client
 *
 * Connects to the MCP server, lists all tools, calls clickAnnounce, and exits.
 *
 * Run:  npm run click
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3098/mcp';

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({ name: 'click-announce', version: '1.0.0' }, { capabilities: {} });

  await client.connect(transport);
  console.log(`Connected to ${MCP_URL}\n`);

  // List tools
  const { tools } = await client.listTools();
  console.log(`Available tools (${tools.length}):`);
  for (const t of tools) {
    console.log(`  - ${t.name}`);
  }

  // Call clickAnnounce
  const toolName = tools.find(t => t.name.endsWith('__clickAnnounce'))?.name;
  if (!toolName) {
    console.log('\nNo clickAnnounce tool found — is the clock page connected?');
  } else {
    console.log(`\nCalling ${toolName}...`);
    const result = await client.callTool({ name: toolName, arguments: {} });
    console.log('Result:', result.content.map(c => c.text).join(' '));
  }

  await client.close();
}

main().catch(err => { console.error(err.message); process.exit(1); });
