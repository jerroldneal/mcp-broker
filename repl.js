#!/usr/bin/env node
/**
 * Interactive REPL for the MCP Broker
 *
 * Connects as a standard MCP client, lists available tools, lets you pick one,
 * prompts for each parameter, calls the tool, and prints the result.
 *
 * Run:
 *   npm run dev   # terminal 1
 *   npm run repl             # terminal 2
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createInterface } from 'readline';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3098/mcp';
const CALL_TIMEOUT = 120_000; // must exceed server's TOOL_CALL_TIMEOUT_MS

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

let client;
let tools = [];

async function connect() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  client = new Client({ name: 'repl', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
}

async function refreshTools() {
  const res = await client.listTools();
  tools = res.tools;
}

function printTools() {
  if (tools.length === 0) {
    console.log('\n  (no tools available)\n');
    return;
  }
  console.log();
  for (let i = 0; i < tools.length; i++) {
    const t = tools[i];
    const desc = t.description ? ` — ${t.description}` : '';
    console.log(`  ${i + 1}) ${t.name}${desc}`);
  }
  console.log();
}

function getParams(schema) {
  const props = schema?.properties || {};
  const required = new Set(schema?.required || []);
  return Object.entries(props).map(([name, def]) => ({
    name,
    type: def.type || 'string',
    description: def.description || '',
    required: required.has(name),
  }));
}

function coerce(value, type) {
  if (value === '') return undefined;
  if (type === 'number' || type === 'integer') return Number(value);
  if (type === 'boolean') return value === 'true' || value === '1';
  return value;
}

async function promptArgs(tool) {
  const params = getParams(tool.inputSchema);
  if (params.length === 0) return {};

  console.log('  Parameters:');
  const args = {};
  for (const p of params) {
    const req = p.required ? ' (required)' : ' (optional)';
    const hint = p.description ? ` — ${p.description}` : '';
    const raw = await ask(`    ${p.name} [${p.type}]${req}${hint}: `);
    const val = coerce(raw.trim(), p.type);
    if (val !== undefined) args[p.name] = val;
  }
  return args;
}

async function repl() {
  while (true) {
    await refreshTools();
    printTools();

    const input = await ask('Pick a tool number (or q to quit, r to refresh): ');
    const trimmed = input.trim().toLowerCase();

    if (trimmed === 'q' || trimmed === 'quit' || trimmed === 'exit') break;
    if (trimmed === 'r' || trimmed === 'refresh' || trimmed === '') continue;

    const idx = parseInt(trimmed, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= tools.length) {
      console.log('  Invalid selection.\n');
      continue;
    }

    const tool = tools[idx];
    console.log(`\n  → ${tool.name}`);

    const args = await promptArgs(tool);

    console.log(`  Calling ${tool.name}...`);
    try {
      const result = await client.callTool({ name: tool.name, arguments: args }, undefined, { timeout: CALL_TIMEOUT });
      console.log('\n  Result:');
      for (const item of result.content || []) {
        if (item.type === 'text') {
          console.log(`    ${item.text}`);
        } else {
          console.log(`    [${item.type}]`, JSON.stringify(item).slice(0, 200));
        }
      }
      if (result.isError) console.log('  (tool returned an error)');
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
    console.log();
  }
}

async function main() {
  console.log(`Connecting to ${MCP_URL}...`);
  try {
    await connect();
  } catch (err) {
    console.error(`Failed to connect: ${err.message}`);
    process.exit(1);
  }
  console.log('Connected. Type a tool number to call it.\n');
  await repl();
  rl.close();
  await client.close();
}

main();
