#!/usr/bin/env node
/**
 * 3-Minute Problem-Solution-Collab Discussion
 *
 * Four speakers — marcus (manager), sarah (supervisor), george (developer),
 * emma (browser/extension) — take turns discussing how to implement the
 * problem-solution-collab.md architecture using the broker-client pattern.
 * Each turn is kept under 30 seconds of speech (~75 words).
 * Runs for 3 minutes then shows the full transcript.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const DURATION_MS = 3 * 60 * 1000; // 3 minutes
const PAUSE_BETWEEN_TURNS_MS = 2000; // 2s pause between speakers

const SPEAKERS = ['marcus', 'sarah', 'george', 'emma'];
const ICONS = { marcus: '👔', sarah: '📋', george: '⛏️', emma: '🌐' };

const SEED_PROMPT = `Let's discuss how to implement the problem-solution-collab architecture using the broker-client pattern. The core idea: multiple collaborators (manager, supervisor, workers) each have partial information. None alone can solve the problem. They need to negotiate a "problem package" — combining their individual context heaps — before any solution is attempted. Each collaborator is an independent AI-equipped agent connected via WebSocket broker-client. How should we architect this?`;

const CONTINUATION_PROMPTS = [
  'Build on what was just said. How does the broker-client ToolProvider pattern map to the collaborator concept?',
  'Challenge what was said. What about the case where a collaborator has information but doesn\'t know they have it — like the blood pressure example?',
  'How would the problem-package negotiation work concretely? What messages flow between broker-clients?',
  'Push back. What happens when the worker hits a roadblock and needs supervisor context? How does tool registration help?',
  'Think about the browser extension use case — the website has data but doesn\'t know it. How does instrumentation make the website a collaborator?',
  'What does the orchestration layer look like? Who decides when the problem package is "framed" and ready for solution?',
  'React to the architecture discussion. How do authorization boundaries work — who can call the shot to abandon a task?',
  'Connect this to the mining metaphor. Cost-prohibitive for workers to reach the surface. How does the WebSocket channel solve this?',
];

function pickContinuation() {
  return CONTINUATION_PROMPTS[Math.floor(Math.random() * CONTINUATION_PROMPTS.length)];
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Connect
const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3098/mcp'));
const client = new Client({ name: 'conversation-runner', version: '1.0' }, { capabilities: {} });
await client.connect(transport);
console.log('Connected to broker server\n');

// Reset any prior conversation
await client.callTool({ name: 'conversation-speaker__reset', arguments: {} }, undefined, { timeout: 10000 });
console.log('Conversation reset.\n');

const startTime = Date.now();
let turnCount = 0;
let speakerIndex = 0;

// Kick off with the seed prompt — marcus (manager) sets the stage
let nextPrompt = SEED_PROMPT;

while (Date.now() - startTime < DURATION_MS) {
  const speaker = SPEAKERS[speakerIndex % SPEAKERS.length];
  turnCount++;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const toolName = `conversation-speaker__${speaker}`;
  const icon = ICONS[speaker];

  console.log(`\n[${elapsed}s] Turn ${turnCount} — ${icon} ${speaker}`);
  console.log(`  Prompt: ${nextPrompt.substring(0, 80)}...`);

  try {
    const result = await client.callTool(
      { name: toolName, arguments: { prompt: nextPrompt } },
      undefined,
      { timeout: 120000 }
    );

    const response = result.content[0].text;
    console.log(`  Response: ${response}`);

    // Use a continuation prompt — the conversation context already carries history
    nextPrompt = pickContinuation();
    speakerIndex++;

  } catch (err) {
    console.error(`  Error: ${err.message}`);
    // Skip to next speaker
    speakerIndex++;
    nextPrompt = 'What do you think about the architecture we\'ve been discussing? Add your perspective.';
  }

  // Pause between turns
  await sleep(PAUSE_BETWEEN_TURNS_MS);
}

// Show final transcript
console.log('\n\n========== FULL TRANSCRIPT ==========\n');
const transcript = await client.callTool(
  { name: 'conversation-speaker__show', arguments: {} },
  undefined,
  { timeout: 10000 }
);
console.log(transcript.content[0].text);

const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
console.log(`\n========== ${turnCount} turns in ${totalElapsed} minutes ==========`);

await client.close();
