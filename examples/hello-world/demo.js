#!/usr/bin/env node
/**
 * Full Demo: MCP Broker-Client Architecture
 *
 * Runs ALL THREE components in a single process to show the complete round-trip:
 *
 *   1. Starts the broker (MCP broker) as a child process
 *   2. Connects a broker-client that publishes a "hello_world" tool
 *   3. Connects a normal MCP client via HTTP
 *   4. The MCP client lists tools and calls the hello_world tool
 *
 * Run:  npm run demo
 *
 * ┌──────────────┐  HTTP (MCP)   ┌──────────────────────┐   WebSocket    ┌──────────────────┐
 * │  MCP Client  │ ◄───────────► │  broker-client-     │ ◄────────────► │  Broker-Client  │
 * │  (this demo) │               │  server (broker)     │                │  (hello-world)   │
 * └──────────────┘               └──────────────────────┘                └──────────────────┘
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BrokerClient } from '../../sdk.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MCP_URL = 'http://localhost:3098/mcp';

// ─── ANSI helpers ───────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function header(text) {
  console.log(`\n${C.bold}${C.cyan}${'═'.repeat(55)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${text}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${'═'.repeat(55)}${C.reset}\n`);
}

function step(num, text) {
  console.log(`${C.bold}${C.yellow}  [Step ${num}]${C.reset} ${text}`);
}

function result(text) {
  console.log(`${C.green}  ✅ ${text}${C.reset}`);
}

function info(text) {
  console.log(`${C.dim}     ${text}${C.reset}`);
}

function toolLine(name, desc) {
  console.log(`${C.magenta}     📦 ${name}${C.reset}`);
  console.log(`${C.dim}        ${desc}${C.reset}`);
}

function callResult(text) {
  console.log(`${C.blue}     📨 ${text}${C.reset}`);
}

// ─── Main Demo ──────────────────────────────────────────────────────────────

async function main() {
  header('MCP Broker-Client — Full Demo');

  // ── Step 1: Start the server as MCP child process ──────────────────────

  step(1, 'Starting broker (broker)...');
  info('Spawning server.js — HTTP MCP on :3098, WebSocket on :3099');

  const serverProcess = spawn('node', [join(__dirname, '..', '..', 'server.js')], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  // Wait for server to be ready by watching stderr
  await new Promise((resolve) => {
    serverProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      process.stderr.write(msg);
      if (msg.includes('MCP HTTP server listening')) resolve();
    });
  });

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const mcpClient = new Client(
    { name: 'demo-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await mcpClient.connect(transport);
  result('Server started and MCP client connected via HTTP');

  // ── Step 2: Connect a broker-client with hello-world tools ────────────

  step(2, 'Connecting broker-client "hello-world"...');
  info('Publishing tools: greet, add');

  const rc = new BrokerClient('hello-world', { url: 'ws://localhost:3099', autoReconnect: false });

  rc.addTool({
    name: 'greet',
    description: 'Returns a friendly greeting',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name to greet' } },
      required: ['name'],
    },
    handler: async ({ name }) => `Hello, ${name}! 👋 This response came from a broker-client.`,
  });

  rc.addTool({
    name: 'add',
    description: 'Add two numbers together',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
    handler: async ({ a, b }) => `${a} + ${b} = ${a + b}`,
  });

  await rc.connect();
  result('Broker client registered with 2 tools');

  // Small delay so registry updates
  await sleep(300);

  // ── Step 3: MCP client lists tools ─────────────────────────────────────

  step(3, 'MCP client listing available tools...');
  const { tools } = await mcpClient.listTools();
  result(`Found ${tools.length} tool(s):\n`);

  for (const tool of tools) {
    toolLine(tool.name, tool.description || '(no description)');
  }
  console.log();

  // ── Step 4: MCP client calls greet tool ────────────────────────────────

  step(4, 'MCP client calling hello-world__greet({ name: "World" })...');

  const greetResult = await mcpClient.callTool({
    name: 'hello-world__greet',
    arguments: { name: 'World' },
  });

  for (const item of greetResult.content) {
    callResult(item.text);
  }
  result('greet call succeeded\n');

  // ── Step 5: MCP client calls add tool ──────────────────────────────────

  step(5, 'MCP client calling hello-world__add({ a: 7, b: 35 })...');

  const addResult = await mcpClient.callTool({
    name: 'hello-world__add',
    arguments: { a: 7, b: 35 },
  });

  for (const item of addResult.content) {
    callResult(item.text);
  }
  result('add call succeeded\n');

  // ── Step 6: List broker-clients via built-in tool ─────────────────────

  step(6, 'MCP client calling list_broker_clients...');

  const listResult = await mcpClient.callTool({
    name: 'list_broker_clients',
    arguments: {},
  });

  for (const item of listResult.content) {
    info(item.text);
  }
  console.log();

  // ── Done ───────────────────────────────────────────────────────────────

  header('Demo Complete!');
  console.log(`${C.dim}  The flow was:${C.reset}`);
  console.log(`${C.dim}    MCP Client ──HTTP──► Server ──WebSocket──► Broker-Client${C.reset}`);
  console.log(`${C.dim}    MCP Client ◄─HTTP── Server ◄──WebSocket── Broker-Client${C.reset}`);
  console.log(`${C.dim}${C.reset}`);
  console.log(`${C.dim}  Normal MCP clients see standard tools.${C.reset}`);
  console.log(`${C.dim}  They have no idea the tools come from broker-clients.${C.reset}\n`);

  // Cleanup
  rc.disconnect();
  await mcpClient.close();
  serverProcess.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('Demo error:', err.message);
  process.exit(1);
});
