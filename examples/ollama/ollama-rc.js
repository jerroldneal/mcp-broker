#!/usr/bin/env node
/**
 * Ollama Broker-Client
 *
 * Connects to the MCP broker and publishes an LLM inference tool.
 * Calls the local Ollama API (http://localhost:11434) to generate responses.
 *
 * Published tools:
 *   - generate: Send a prompt to a model and get a response
 *
 * Run:  npm run ollama
 *
 * Requires: Ollama running locally (ollama serve)
 */

import { BrokerClient } from '../../sdk.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:14b';
const CLIENT_ID = 'ollama';

const rc = new BrokerClient(CLIENT_ID, {
  url: process.env.BROKER_WS_URL || 'ws://localhost:3099',
});

rc.addTool({
  name: 'generate',
  description: `Send a prompt to Ollama (${DEFAULT_MODEL}) and get a text response`,
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The prompt to send to the model' },
      model: { type: 'string', description: `Model name (default: ${DEFAULT_MODEL})` },
    },
    required: ['prompt'],
  },
  handler: async (args) => {
    const model = args.model || DEFAULT_MODEL;
    const prompt = args.prompt;

    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
      });

      if (!res.ok) {
        const text = await res.text();
        return `Ollama error (HTTP ${res.status}): ${text}`;
      }

      const data = await res.json();
      return data.response || '(empty response)';
    } catch (err) {
      return `Ollama connection failed: ${err.message}`;
    }
  },
});

await rc.connect();
console.log(`[ollama-rc] Connected as "${CLIENT_ID}" — model: ${DEFAULT_MODEL}`);
console.log(`[ollama-rc] Ollama API: ${OLLAMA_URL}`);
console.log('[ollama-rc] Published tool: generate');
console.log('[ollama-rc] Waiting for calls... (Ctrl+C to stop)');
