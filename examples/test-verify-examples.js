#!/usr/bin/env node
/**
 * Temporary test script to verify examples that run as long-lived services.
 * Spawns each service, checks the broker API for registration, then kills it.
 * Delete after verification.
 */
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BROKER_URL = 'http://localhost:3098/api/status';

function fetchStatus() {
  return new Promise((resolve, reject) => {
    http.get(BROKER_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from broker')); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testService(name, script, clientId, timeout = 8000) {
  console.log(`\n=== Testing: ${name} ===`);

  // Check if already registered (from a previous run)
  const before = await fetchStatus();
  const alreadyExists = before.clients.some(c => c.clientId === clientId);
  if (alreadyExists) {
    console.log(`  ⚠️  ${clientId} already registered — skipping spawn (already running)`);
    const client = before.clients.find(c => c.clientId === clientId);
    console.log(`  ✅ PASS — ${client.tools.length} tools registered: ${client.tools.map(t => t.name).join(', ')}`);
    return { name, status: 'pass', tools: client.tools.length, note: 'already running' };
  }

  // Spawn the service
  const child = spawn('node', [script], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  let stdout = '', stderr = '';
  child.stdout.on('data', d => stdout += d);
  child.stderr.on('data', d => stderr += d);

  // Wait for it to connect
  let found = false;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await sleep(1000);
    try {
      const status = await fetchStatus();
      const client = status.clients.find(c => c.clientId === clientId);
      if (client) {
        console.log(`  ✅ PASS — ${clientId} registered with ${client.tools.length} tools: ${client.tools.map(t => t.name).join(', ')}`);
        found = true;
        break;
      }
    } catch { /* broker not ready yet */ }
  }

  if (!found) {
    console.log(`  ❌ FAIL — ${clientId} did not register within ${timeout}ms`);
    if (stderr) console.log(`  stderr: ${stderr.trim()}`);
  }

  // Kill the child
  child.kill('SIGTERM');
  await sleep(500);
  if (!child.killed) child.kill('SIGKILL');
  console.log(`  Process cleaned up.`);

  return { name, status: found ? 'pass' : 'fail', tools: found ? undefined : 0 };
}

async function main() {
  console.log('MCP Broker Client — Example Verification');
  console.log('==========================================');

  const results = [];

  // Test 1: simple-service
  results.push(await testService(
    'simple-service',
    'simple-service/simple-service.js',
    'simple-service'
  ));

  // Test 2: ollama broker-client
  results.push(await testService(
    'ollama',
    'ollama/ollama-rc.js',
    'ollama',
    10000
  ));

  // Test 3: ai-invoke broker-client
  results.push(await testService(
    'ai-invoke',
    'ai-invoke/ai-invoke-rc.js',
    'ai-invoke',
    10000
  ));

  // Test 4: conversation-speaker
  results.push(await testService(
    'conversation-speaker',
    'conversation-speaker/conversation-speaker.js',
    'conversation-speaker',
    10000
  ));

  // Summary
  console.log('\n==========================================');
  console.log('RESULTS SUMMARY');
  console.log('==========================================');
  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}: ${r.status}${r.note ? ` (${r.note})` : ''}`);
  }
  const passed = results.filter(r => r.status === 'pass').length;
  console.log(`\n  ${passed}/${results.length} passed`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
