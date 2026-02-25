#!/usr/bin/env node
/**
 * ConversationSpeaker — A ToolProvider that maintains a conversation and speaks.
 *
 * Tools:
 *   mansplain  — AI generates a contextual response, spoken in a male voice
 *   girlsplain — AI generates a contextual response, spoken in a female voice
 *   reset      — Clears conversation history
 *   show       — Returns the full conversation transcript
 *
 * The AI uses the full conversation as context so each response builds
 * on what came before.
 */

import { ToolProvider } from '../../tool-provider.js';

const TTS_URL = process.env.TTS_URL || 'http://localhost:3021/api/speak';

// 4 distinct personas mapped to the problem-solution-collab mining metaphor
const PERSONAS = {
  marcus: {
    voice: 'am_adam',
    icon: '👔',
    system: `You are Marcus, the Manager — you own the plan and high-level vision. You know WHAT needs to happen but NOT the low-level details. In the mining metaphor you sit at level 0 (the surface). You're discussing how to implement the problem-solution-collab architecture using the broker-client pattern. Focus on: orchestration, problem-package framing, authorization boundaries, and when managers must "call the shot." Acknowledge others' points briefly (~20%), then push your perspective on architecture and control flow (~60%), end with a question (~20%). Keep under 75 words. Be decisive and strategic.`,
  },
  sarah: {
    voice: 'af_sarah',
    icon: '📋',
    system: `You are Sarah, the Supervisor — you have experience from past successes and know how tasks map to the plan. In the mining metaphor you sit at level 1000. You're discussing how to implement the problem-solution-collab architecture using the broker-client pattern. Focus on: how collaborators negotiate problem packages, how context from different levels gets combined, and how the broker-client WebSocket enables each collaborator to be an independent AI-equipped agent. Acknowledge others' points (~20%), share practical insights and challenge gaps (~60%), ask what's missing (~20%). Keep under 75 words. Be pragmatic and experienced.`,
  },
  george: {
    voice: 'bm_george',
    icon: '⛏️',
    system: `You are George, the Developer/Worker — you have hands-on implementation knowledge. In the mining metaphor you sit at level 1100 at the rock face. You're discussing how to implement the problem-solution-collab architecture using the broker-client pattern. Focus on: how each collaborator registers as a ToolProvider broker-client, how the "information heap" gets built through tool calls, and concrete code patterns. Acknowledge others' points (~20%), push back on impractical ideas and propose concrete solutions (~60%), ask about edge cases (~20%). Keep under 75 words. Be technical and blunt.`,
  },
  emma: {
    voice: 'bf_emma',
    icon: '🌐',
    system: `You are Emma, the Browser/Extension Worker — you represent the website and chrome extension side. In the mining metaphor you're a worker who HAS information but doesn't know she has it. You're discussing how to implement the problem-solution-collab architecture using the broker-client pattern. Focus on: how the website becomes a collaborator via instrumentation, how the extension orchestrates problem discovery, and the "patient doesn't know their blood pressure" pattern. Acknowledge others' points (~20%), highlight browser-side realities and constraints (~60%), challenge assumptions (~20%). Keep under 75 words. Be sharp and practical.`,
  },
};

export class ConversationSpeaker extends ToolProvider {
  constructor(clientId = 'conversation-speaker', options = {}) {
    super(clientId, options);
    this.conversation = [];
  }

  defineTools() {
    const tools = Object.entries(PERSONAS).map(([name, persona]) => ({
      name,
      description: `${name} responds using conversation context, spoken in their unique voice`,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'What to talk about' },
        },
        required: ['prompt'],
      },
      handler: async ({ prompt }) => this._speak(prompt, persona.voice, name),
    }));

    tools.push(
      {
        name: 'reset',
        description: 'Clear the conversation history',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          const count = this.conversation.length;
          this.conversation = [];
          this._log(`Conversation reset (${count} messages cleared)`);
          return `Conversation reset. ${count} messages cleared.`;
        },
      },
      {
        name: 'show',
        description: 'Show the full conversation transcript',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          if (this.conversation.length === 0) return 'Conversation is empty.';
          return this.conversation
            .map((m, i) => `[${i + 1}] ${m.role}: ${m.content}`)
            .join('\n');
        },
      },
    );

    return tools;
  }

  /**
   * Generate an AI response using conversation context, then speak it.
   */
  async _speak(prompt, voice, persona) {
    // Add user message to conversation
    this.conversation.push({ role: 'user', content: prompt });

    const system = PERSONAS[persona].system;

    // Call AI with full conversation context
    const messages = [
      { role: 'system', content: system },
      ...this.conversation,
    ];

    this._log(`${persona} responding to: ${prompt.substring(0, 60)}...`);

    const aiResponse = await this.chat({ messages });
    const text = aiResponse.message.content;

    // Add assistant response to conversation
    this.conversation.push({ role: 'assistant', content: `[${persona}] ${text}` });

    // Speak it via Kokoro TTS
    await this._tts(text, voice);

    this._log(`${persona} spoke: ${text.substring(0, 60)}...`);
    return text;
  }

  /**
   * Send text to the Kokoro TTS processor.
   */
  async _tts(text, voice) {
    const res = await fetch(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) {
      this._log(`TTS error: ${res.status} ${await res.text()}`);
    }
  }
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

const speaker = new ConversationSpeaker();
await speaker.start();
console.log('ConversationSpeaker running. Tools: marcus, sarah, george, emma, reset, show');
console.log('Press Ctrl+C to stop.');

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  speaker.stop();
  process.exit(0);
});
