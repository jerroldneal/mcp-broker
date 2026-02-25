#!/usr/bin/env node
/**
 * Quick non-interactive test of the chat tool through the broker server
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3098/mcp';
const TIMEOUT = 120_000;

async function main() {
  console.log(`Connecting to ${MCP_URL}...`);
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({ name: 'chat-test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  console.log('Connected.');

  // List tools
  const { tools } = await client.listTools();
  console.log(`Found ${tools.length} tools:`, tools.map(t => t.name).join(', '));

  // Find the chat tool
  const chatTool = tools.find(t => t.name.endsWith('__chat'));
  if (!chatTool) {
    console.error('No chat tool found! Is simple-service running?');
    process.exit(1);
  }

  console.log(`\nCalling ${chatTool.name} with prompt "What is 3+3?"...`);
  const start = Date.now();
  try {
    const result = await client.callTool(
      { name: chatTool.name, arguments: { prompt: 'What is 3+3? Answer with just the number.' } },
      undefined,
      { timeout: TIMEOUT }
    );
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nResult (${elapsed}s):`);
    for (const item of result.content || []) {
      if (item.type === 'text') console.log(`  ${item.text}`);
    }
    if (result.isError) console.log('  (tool returned an error)');
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`\nFailed after ${elapsed}s: ${err.message}`);
  }

  await client.close();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
