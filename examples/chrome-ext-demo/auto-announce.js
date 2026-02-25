#!/usr/bin/env node
/**
 * Auto-Announcer
 *
 * Connects to the already-running broker as a standard MCP client
 * (via Streamable HTTP) and calls clock-page__clickAnnounce every 15 seconds.
 *
 * Prerequisite: server must already be running (npm run broker)
 * Run:  npm run auto-announce
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3098/mcp';
const INTERVAL_MS = 15_000;
const TOOL_NAME = 'clock-page__clickAnnounce';

function ts() {
  return new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour12: true });
}

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client(
    { name: 'auto-announcer', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log(`Connected to ${MCP_URL}`);
  console.log(`Pressing Announce every ${INTERVAL_MS / 1000}s — Ctrl+C to stop\n`);

  async function tick() {
    try {
      const { tools } = await client.listTools();
      const tool = tools.find(t => t.name === TOOL_NAME);
      if (!tool) {
        console.log(`[${ts()}] clock-page not connected yet — waiting...`);
        return;
      }
      const result = await client.callTool({ name: tool.name, arguments: {} });
      const text = result.content.map(c => c.text).join(' ');
      console.log(`[${ts()}] ${text}`);
    } catch (err) {
      console.error(`[${ts()}] Error:`, err.message);
    }
  }

  await tick();
  setInterval(tick, INTERVAL_MS);
}

main().catch(err => { console.error(err); process.exit(1); });
