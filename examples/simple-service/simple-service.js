#!/usr/bin/env node
/**
 * Minimal broker-client that runs as a long-lived service.
 *
 * Publishes one tool: `ping` — returns "pong" with a timestamp.
 * Stays alive until Ctrl+C. Reconnects automatically if the server restarts.
 *
 * Usage:
 *   npm run dev   # terminal 1
 *   npm run service  # terminal 2
 */

import { BrokerClient } from '../../sdk.js';

const rc = new BrokerClient('simple-service');

rc.addTool({
  name: 'ping',
  description: 'Returns pong with a timestamp',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => `pong — ${new Date().toISOString()}`,
});

rc.addTool({
  name: 'exit',
  description: 'Gracefully shuts down this broker-client',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => {
    console.log('Exit tool called — shutting down...');
    setTimeout(() => { rc.disconnect(); process.exit(0); }, 100);
    return 'Exiting now.';
  },
});

rc.addTool({
  name: 'chat',
  description: 'Send a prompt to the AI via the broker chat proxy',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The prompt to send' },
    },
    required: ['prompt'],
  },
  handler: async ({ prompt }) => {
    console.log('Chat tool called with prompt:', prompt);
    const response = await rc.chat({
      messages: [{ role: 'user', content: prompt }],
    });
    return response.message.content;
  },
});

await rc.connect();
console.log('simple-service running. Press Ctrl+C to stop.');

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  rc.disconnect();
  process.exit(0);
});
