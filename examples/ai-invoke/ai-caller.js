#!/usr/bin/env node
/**
 * AI Caller — MCP Client Example
 *
 * Connects to the broker as a normal MCP client and calls the
 * ai-invoke broker-client's "invoke" tool with natural language instructions.
 *
 * This demonstrates the full flow:
 *   MCP Client → broker → ai-invoke RC → rc.chat() →
 *   broker → Ollama MCP server → Ollama → response →
 *   RC generates code → evals it → result back to MCP Client
 *
 * Run:
 *   1. Start Ollama MCP server on port 3042
 *   2. npm run dev
 *   3. npm run ai-invoke
 *   4. npm run ai-caller
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3098/mcp';

const INSTRUCTIONS = [
  'Return the current date and time as a formatted string',
  'Return an object with keys: platform, arch, nodeVersion showing the current runtime info',
  'Return the sum of all numbers from 1 to 100',
];

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  AI Caller — invoke tool via Ollama MCP');
  console.log('═══════════════════════════════════════════════\n');

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client(
    { name: 'ai-caller', version: '1.0.0' },
    { capabilities: {} }
  );

  console.log(`Connecting to ${MCP_URL}...`);
  await client.connect(transport);
  console.log('Connected!\n');

  // List tools
  const { tools } = await client.listTools();
  const invokeTool = tools.find(t => t.name.endsWith('__invoke'));

  if (!invokeTool) {
    console.log('No invoke tool found. Is ai-invoke-rc running?');
    console.log('Available tools:', tools.map(t => t.name).join(', ') || '(none)');
    await client.close();
    process.exit(1);
  }

  console.log(`Found: ${invokeTool.name}\n`);

  // Run each instruction
  for (const instruction of INSTRUCTIONS) {
    console.log('── Instruction ────────────────────────────────');
    console.log(`  "${instruction}"\n`);

    try {
      const result = await client.callTool({
        name: invokeTool.name,
        arguments: { instruction },
      });

      const text = result.content
        ?.filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n') || '(no output)';

      console.log(`  Result: ${text}\n`);
    } catch (err) {
      console.error(`  Error: ${err.message}\n`);
    }
  }

  await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
