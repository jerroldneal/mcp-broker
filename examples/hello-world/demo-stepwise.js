#!/usr/bin/env node
/**
 * Step-by-Step Demo (single process orchestration)
 *
 * Reproduces the 3-terminal "Step-by-Step Demo" from the README in one command:
 *   1. Starts the server (background)
 *   2. Starts the sample broker-client (background)
 *   3. Runs the MCP client (foreground) — lists tools, calls greet + add
 *   4. Cleans up all child processes on exit
 *
 * Run:  npm run demo:stepwise
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const children = [];

function cleanup() {
  for (const child of children) {
    try { child.kill(); } catch {}
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

function waitForOutput(proc, match, label, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timed out waiting for "${match}"`)), timeoutMs);

    function onData(data) {
      const text = data.toString();
      if (text.includes(match)) {
        clearTimeout(timer);
        resolve();
      }
    }

    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
  });
}

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  MCP Broker-Client — Step-by-Step Demo');
  console.log('══════════════════════════════════════════════════\n');

  // ── Step 1: Start server ──────────────────────────────────────────────
  console.log('  [Step 1] Starting server...');

  const server = spawn('node', ['server.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(server);

  await waitForOutput(server, 'MCP HTTP server listening', 'server');
  console.log('  ✅ Server ready (HTTP :3098, WebSocket :3099)\n');

  // ── Step 2: Start sample broker-client ──────────────────────────
  console.log('  [Step 2] Starting sample broker-client...');

  const example = spawn('node', ['examples/hello-world/broker-client.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(example);

  await waitForOutput(example, 'connected', 'hello-world');
  console.log('  ✅ Broker client registered (greet, add)\n');

  // Give registry a moment to settle
  await new Promise(r => setTimeout(r, 500));

  // ── Step 3: Run MCP client ────────────────────────────────────────────
  console.log('  [Step 3] Running MCP client...\n');

  const client = spawn('node', ['examples/hello-world/mcp-client.js'], { cwd: ROOT, stdio: 'inherit' });
  children.push(client);

  await new Promise((resolve, reject) => {
    client.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`MCP client exited with code ${code}`));
    });
  });

  console.log('\n══════════════════════════════════════════════════');
  console.log('  Step-by-Step Demo Complete!');
  console.log('══════════════════════════════════════════════════\n');

  cleanup();
  process.exit(0);
}

main().catch(err => {
  console.error('\n  ❌ Demo failed:', err.message);
  cleanup();
  process.exit(1);
});
