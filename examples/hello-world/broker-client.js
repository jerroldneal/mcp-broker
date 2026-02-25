#!/usr/bin/env node
/**
 * Example: Hello World Broker-Client
 *
 * Connects to the broker and publishes two tools:
 *   - greet: Returns a greeting
 *   - add: Adds two numbers
 *
 * Start the server first:   npm run dev
 * Then run this example:    npm run broker-client
 */

import { BrokerClient } from '../../sdk.js';

const rc = new BrokerClient('hello-world');

rc.addTool({
  name: 'greet',
  description: 'Returns a friendly greeting',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name to greet' },
    },
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

try {
  await rc.connect();
  console.log('Broker client connected and tools published. Press Ctrl+C to exit.');
} catch (err) {
  console.error('Failed to connect:', err.message);
  process.exit(1);
}
