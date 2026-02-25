#!/usr/bin/env node
/**
 * Server + Example launcher
 *
 * Starts the server and sample broker-client together in one command.
 * Useful for testing the Chrome extension or auto-announcer without needing
 * multiple terminals.
 *
 * Run:  npm run serve
 *
 * Then in another terminal (or via shell-exec):
 *   npm run client          # MCP client test
 *   npm run auto-announce   # auto-announce test
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

async function main() {
  console.log('[serve] Starting server + sample broker-client...');

  // Start server
  const server = spawn('node', ['server.js'], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  children.push(server);

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Start sample broker-client
  const example = spawn('node', ['examples/hello-world/broker-client.js'], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  children.push(example);

  console.log('[serve] Both running. Press Ctrl+C to stop.');

  // Keep alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error('[serve] Error:', err.message);
  cleanup();
  process.exit(1);
});
