#!/usr/bin/env node
/**
 * AI-Invoke Broker-Client
 *
 * A broker-client that publishes an "invoke" tool. When called with a
 * natural language instruction, it:
 *   1. Uses rc.chat() to ask the AI to generate JavaScript code
 *   2. Evaluates the generated code in its environment
 *   3. Returns the result
 *
 * The chat() call goes through the broker, which proxies to the
 * Ollama MCP server — so this broker-client never needs to know about
 * Ollama directly.
 *
 * Run:
 *   1. Start Ollama MCP server on port 3042
 *   2. npm run broker
 *   3. npm run example:ai-invoke
 *
 * Then from another terminal:
 *   npm run example:ai-caller
 */

import { BrokerClient } from '../../sdk.js';

const CLIENT_ID = 'ai-invoke';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

const rc = new BrokerClient(CLIENT_ID, {
  url: process.env.BROKER_WS_URL || 'ws://localhost:3099',
});

const SYSTEM_PROMPT = `You are a code generator. You ONLY output valid JavaScript code.
No explanations, no markdown, no comments — just the code.
The code will be evaluated with eval() and its return value captured.
Always return a value (use an expression or wrap in an IIFE that returns).
You are running in a Node.js environment.`;

rc.addTool({
  name: 'invoke',
  description: 'Execute a natural language instruction by generating and running JavaScript code via AI',
  inputSchema: {
    type: 'object',
    properties: {
      instruction: {
        type: 'string',
        description: 'Natural language description of what to do (e.g., "return the current date and time")',
      },
      model: {
        type: 'string',
        description: `Model to use for code generation (default: ${DEFAULT_MODEL})`,
      },
    },
    required: ['instruction'],
  },
  handler: async (args) => {
    const { instruction, model } = args;
    const useModel = model || DEFAULT_MODEL;

    console.log(`[ai-invoke] Instruction: "${instruction}"`);
    console.log(`[ai-invoke] Asking ${useModel} to generate code...`);

    // Use chat() — goes through broker → Ollama MCP server
    let chatResponse;
    try {
      chatResponse = await rc.chat({
        model: useModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: instruction },
        ],
      });
    } catch (err) {
      return `Chat failed: ${err.message}`;
    }

    const generatedCode = chatResponse?.message?.content?.trim();
    if (!generatedCode) {
      return 'AI returned empty response — no code generated';
    }

    console.log(`[ai-invoke] Generated code:\n${generatedCode}\n`);

    // Evaluate the generated code
    try {
      // eslint-disable-next-line no-eval
      const result = eval(generatedCode);
      const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      console.log(`[ai-invoke] Result: ${output}`);
      return output;
    } catch (err) {
      console.error(`[ai-invoke] Eval error: ${err.message}`);
      return `Code execution failed: ${err.message}\nGenerated code:\n${generatedCode}`;
    }
  },
});

await rc.connect();
console.log(`[ai-invoke] Connected as "${CLIENT_ID}"`);
console.log(`[ai-invoke] Published tool: invoke`);
console.log(`[ai-invoke] Default model: ${DEFAULT_MODEL}`);
console.log('[ai-invoke] Waiting for calls... (Ctrl+C to stop)');
