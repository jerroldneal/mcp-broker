#!/usr/bin/env node
/**
 * Example: Normal MCP Client
 *
 * Connects to the broker as a standard MCP client (via HTTP),
 * lists available tools, and calls the hello-world broker-client's "greet" tool.
 *
 * Prerequisites:
 *   1. Start the server:           npm run broker
 *   2. Start broker-client:       npm run example:broker-client
 *   3. Then run this:              npm run client
 *
 * This demonstrates the consumer side — a normal MCP client that has no idea
 * it's talking to broker-clients. It just sees standard MCP tools.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3098/mcp';

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  MCP Client → broker demo');
  console.log('═══════════════════════════════════════════════\n');

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));

  const client = new Client(
    { name: 'demo-mcp-client', version: '1.0.0' },
    { capabilities: {} }
  );

  console.log(`⏳ Connecting to ${MCP_URL}...`);
  await client.connect(transport);
  console.log('✅ Connected!\n');

  // List tools
  console.log('── Listing tools ──────────────────────────────');
  const { tools } = await client.listTools();

  if (tools.length === 0) {
    console.log('  (no tools available — is a broker-client connected?)\n');
  } else {
    for (const tool of tools) {
      console.log(`  📦 ${tool.name}`);
      console.log(`     ${tool.description || '(no description)'}\n`);
    }
  }

  // Try calling hello-world__greet if available
  const greetTool = tools.find(t => t.name.endsWith('__greet'));
  if (greetTool) {
    console.log('── Calling greet tool ─────────────────────────');
    console.log(`  Tool: ${greetTool.name}`);
    console.log(`  Args: { name: "World" }\n`);

    const result = await client.callTool({
      name: greetTool.name,
      arguments: { name: 'World' },
    });

    console.log('  📨 Result:');
    for (const item of result.content) {
      console.log(`     ${item.text}`);
    }
    console.log();
  }

  // Try calling hello-world__add if available
  const addTool = tools.find(t => t.name.endsWith('__add'));
  if (addTool) {
    console.log('── Calling add tool ───────────────────────────');
    console.log(`  Tool: ${addTool.name}`);
    console.log(`  Args: { a: 7, b: 35 }\n`);

    const result = await client.callTool({
      name: addTool.name,
      arguments: { a: 7, b: 35 },
    });

    console.log('  📨 Result:');
    for (const item of result.content) {
      console.log(`     ${item.text}`);
    }
    console.log();
  }

  // List broker clients (built-in tool)
  const listTool = tools.find(t => t.name === 'list_broker_clients');
  if (listTool) {
    console.log('── Listing broker-clients ────────────────────');
    const result = await client.callTool({ name: 'list_broker_clients', arguments: {} });
    for (const item of result.content) {
      console.log(`  ${item.text}`);
    }
    console.log();
  }

  console.log('═══════════════════════════════════════════════');
  console.log('  Demo complete!');
  console.log('═══════════════════════════════════════════════');

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
