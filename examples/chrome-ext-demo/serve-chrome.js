#!/usr/bin/env node
/**
 * Chrome Extension Demo — Server Orchestrator
 *
 * Starts everything the Chrome extension demo needs in one command:
 *   1. MCP broker server (HTTP :3098, WebSocket :3099)
 *   2. Auto-announcer (calls clickAnnounce every 15s once the extension connects)
 *
 * After running this, load the Chrome extension and open the clock page.
 * The auto-announcer will wait for the clock-page broker-client to appear,
 * then start calling clickAnnounce every 15 seconds.
 *
 * Run:  npm run serve:chrome
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

function waitForOutput(proc, match, label, timeoutMs = 15000) {
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
  console.log('  Chrome Extension Demo — Server Orchestrator');
  console.log('══════════════════════════════════════════════════\n');

  // ── Step 1: Start server ──────────────────────────────────────────────
  console.log('  [1/2] Starting MCP broker server...');

  const server = spawn('node', ['server.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(server);

  // Mirror server output with prefix
  server.stdout.on('data', d => process.stdout.write(`  [server] ${d}`));
  server.stderr.on('data', d => process.stderr.write(`  [server] ${d}`));

  await waitForOutput(server, 'MCP HTTP server listening', 'server');
  console.log('  ✅ Server ready (HTTP :3098, WebSocket :3099)\n');

  // ── Step 2: Start auto-announcer ──────────────────────────────────────
  console.log('  [2/2] Starting auto-announcer (15s interval)...');

  const announcer = spawn('node', ['examples/chrome-ext-demo/auto-announce.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(announcer);

  announcer.stdout.on('data', d => process.stdout.write(`  [announce] ${d}`));
  announcer.stderr.on('data', d => process.stderr.write(`  [announce] ${d}`));

  // Wait for announcer to connect to MCP server
  await waitForOutput(announcer, 'Connected to', 'auto-announce');
  console.log('  ✅ Auto-announcer connected\n');

  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │  Now load the Chrome extension:              │');
  console.log('  │                                              │');
  console.log('  │  1. Go to chrome://extensions                │');
  console.log('  │  2. Enable Developer mode                    │');
  console.log('  │  3. Load unpacked → examples/chrome-ext-demo │');
  console.log('  │  4. Click extension icon → Open Clock Page   │');
  console.log('  │                                              │');
  console.log('  │  The auto-announcer will call clickAnnounce  │');
  console.log('  │  every 15s once the clock page connects.     │');
  console.log('  │                                              │');
  console.log('  │  Press Ctrl+C to stop all services.          │');
  console.log('  └──────────────────────────────────────────────┘\n');

  // Keep alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error('\n  ❌ Error:', err.message);
  cleanup();
  process.exit(1);
});
