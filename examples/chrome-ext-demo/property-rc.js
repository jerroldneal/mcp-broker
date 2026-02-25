/**
 * Property Broker-Client (browser-injectable)
 *
 * Publishes an `addProperty` tool via the broker. When called with
 * a name and prompt, it uses an iterative AI conversation to:
 *   1. Ask the AI what information it needs to generate code
 *   2. Gather each requirement by evaling AI-suggested expressions
 *   3. Have the AI generate the final code with full context
 *   4. Eval and store the result as a named property
 *
 * The chat() calls go through the broker → Ollama MCP server,
 * so this script never needs to know about Ollama directly.
 *
 * Injected into the Chrome extension clock page alongside inject.js.
 */

(function () {
  'use strict';

  if (window.__propertyRcInjected) {
    console.log('[PropertyRC] Already injected, skipping');
    return;
  }
  window.__propertyRcInjected = true;

  const RC_SERVER_URL = 'ws://localhost:3099';
  const CLIENT_ID = 'property-agent';
  const RECONNECT_BASE_MS = 2000;
  const RECONNECT_MAX_MS = 30000;
  const CHAT_TIMEOUT_MS = 120000;
  const DEFAULT_MODEL = 'llama3.2';

  let ws = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  let intentionalClose = false;
  let registered = false;

  // Named properties: name → { prompt, code, getValue() }
  const properties = {};
  window.__properties = properties;

  // Pending chat requests: requestId → { resolve, reject, timer }
  const pendingChats = new Map();

  // Conversation log for UI visibility
  const conversationLog = [];
  window.__propertyConversationLog = conversationLog;

  // ── Status helpers ─────────────────────────────────────────────────────

  function updateStatus(text, connected) {
    const el = document.getElementById('property-rc-status');
    if (el) {
      el.textContent = text;
      el.className = connected ? 'rc-connected' : 'rc-disconnected';
    }
  }

  function logStep(step) {
    conversationLog.push({ time: new Date().toISOString(), ...step });
    // Dispatch event so UI can update
    window.dispatchEvent(new CustomEvent('property-log', { detail: step }));
  }

  // ── Chat over WebSocket ────────────────────────────────────────────────

  function generateId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function chat(payload) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !registered) {
        return reject(new Error('Not connected'));
      }
      const requestId = generateId();
      const timer = setTimeout(() => {
        pendingChats.delete(requestId);
        reject(new Error('Chat timeout'));
      }, CHAT_TIMEOUT_MS);

      pendingChats.set(requestId, { resolve, reject, timer });
      ws.send(JSON.stringify({ type: 'chat_request', requestId, payload }));
    });
  }

  // ── Iterative Property Resolution ──────────────────────────────────────

  async function resolveProperty(name, prompt) {
    const messages = [];
    const gathered = {};

    logStep({ phase: 'start', name, prompt });

    // Step 1: Ask AI what it needs
    const systemMsg = `You are an expert JavaScript developer helping generate code for a Chrome browser page.
The code will run in the page's content script context via eval().
You are assisting like a customer service expert: first gather requirements, then deliver.
Do NOT write code yet. Only respond with what you need to know.`;

    const askMsg = `I need to generate a JavaScript expression that runs in this Chrome browser page and returns: ${prompt}

What information do you need from me to generate this code?
Respond with a numbered checklist ONLY. Each item should be a specific question about the page structure, available APIs, or element details. Keep it to 5 items max.`;

    messages.push({ role: 'system', content: systemMsg });
    messages.push({ role: 'user', content: askMsg });

    logStep({ phase: 'asking_requirements', message: askMsg });

    let requirementsResponse;
    try {
      requirementsResponse = await chat({ model: DEFAULT_MODEL, messages: [...messages] });
    } catch (err) {
      logStep({ phase: 'error', message: `Chat failed: ${err.message}` });
      return { error: `Requirements chat failed: ${err.message}` };
    }

    const requirementsText = requirementsResponse?.message?.content || '';
    messages.push({ role: 'assistant', content: requirementsText });
    logStep({ phase: 'requirements_received', content: requirementsText });

    // Parse checklist items (numbered lines)
    const checklistItems = requirementsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^\d+[\.\)]\s/.test(line))
      .map(line => line.replace(/^\d+[\.\)]\s*/, ''));

    if (checklistItems.length === 0) {
      logStep({ phase: 'warning', message: 'No checklist items found, trying direct code generation' });
      // Fall through to final code generation with what we have
    }

    // Step 2: For each checklist item, ask how to get it and eval
    for (let i = 0; i < checklistItems.length; i++) {
      const item = checklistItems[i];
      logStep({ phase: 'gathering', index: i + 1, item });

      // Ask AI for a JS expression to answer this question
      const gatherMsg = `For checklist item: "${item}"
Give me a single JavaScript expression I can eval() in the browser page to get this information.
Respond with ONLY the expression — no explanation, no markdown, no backticks.`;

      messages.push({ role: 'user', content: gatherMsg });

      let exprResponse;
      try {
        exprResponse = await chat({ model: DEFAULT_MODEL, messages: [...messages] });
      } catch (err) {
        logStep({ phase: 'gather_error', index: i + 1, error: err.message });
        messages.push({ role: 'assistant', content: '(failed to get expression)' });
        gathered[`item_${i + 1}`] = { question: item, result: '(unavailable)' };
        continue;
      }

      const exprText = (exprResponse?.message?.content || '').trim();
      messages.push({ role: 'assistant', content: exprText });
      logStep({ phase: 'expression_received', index: i + 1, expression: exprText });

      // Eval the expression to get the actual data
      let evalResult;
      try {
        evalResult = eval(exprText);
        if (typeof evalResult === 'object') {
          evalResult = JSON.stringify(evalResult);
        } else {
          evalResult = String(evalResult);
        }
      } catch (err) {
        evalResult = `(eval error: ${err.message})`;
      }

      logStep({ phase: 'data_gathered', index: i + 1, result: evalResult });
      gathered[`item_${i + 1}`] = { question: item, expression: exprText, result: evalResult };

      // Feed the result back to the AI
      const resultMsg = `Result for "${item}": ${evalResult}`;
      messages.push({ role: 'user', content: resultMsg });
    }

    // Step 3: Ask AI to generate the final code
    const gatheredSummary = Object.entries(gathered)
      .map(([key, val]) => `- ${val.question}: ${val.result}`)
      .join('\n');

    const finalMsg = `Here is all the information gathered from the page:
${gatheredSummary || '(no specific information gathered)'}

Now generate a single JavaScript expression that returns: ${prompt}
Respond with ONLY the expression — no explanation, no markdown, no backticks.
The expression will be evaluated with eval() in the browser page.`;

    messages.push({ role: 'user', content: finalMsg });
    logStep({ phase: 'requesting_code', gathered: gatheredSummary });

    let codeResponse;
    try {
      codeResponse = await chat({ model: DEFAULT_MODEL, messages: [...messages] });
    } catch (err) {
      logStep({ phase: 'error', message: `Code generation chat failed: ${err.message}` });
      return { error: `Code generation failed: ${err.message}` };
    }

    const code = (codeResponse?.message?.content || '').trim();
    logStep({ phase: 'code_received', code });

    // Step 4: Eval the final code and store as property
    let value;
    try {
      value = eval(code);
      logStep({ phase: 'complete', name, value: String(value) });
    } catch (err) {
      logStep({ phase: 'eval_error', code, error: err.message });
      return {
        error: `Final eval failed: ${err.message}`,
        generatedCode: code,
        gathered,
      };
    }

    // Store the property
    properties[name] = {
      prompt,
      code,
      gathered,
      value,
      resolvedAt: new Date().toISOString(),
    };

    return {
      name,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
      code,
      stepsCompleted: checklistItems.length,
      gathered,
    };
  }

  // ── WebSocket Broker-Client ─────────────────────────────────────────────

  function connect() {
    if (intentionalClose) return;
    updateStatus('PropertyRC: connecting...', false);

    ws = new WebSocket(RC_SERVER_URL);

    ws.onopen = () => {
      console.log('[PropertyRC] Connected to broker');
      reconnectDelay = RECONNECT_BASE_MS;
      ws.send(JSON.stringify({
        type: 'register',
        clientId: CLIENT_ID,
        tools: [
          {
            name: 'addProperty',
            description: 'Add a named property by describing what it should return. Uses iterative AI conversation to gather requirements and generate code.',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Property name (e.g., "pageTitle", "buttonCount")' },
                prompt: { type: 'string', description: 'What the property should return (e.g., "the main heading text")' },
              },
              required: ['name', 'prompt'],
            },
          },
          {
            name: 'getProperty',
            description: 'Get the current value of a previously added property (re-evaluates the generated code)',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Property name to retrieve' },
              },
              required: ['name'],
            },
          },
          {
            name: 'listProperties',
            description: 'List all added properties with their prompts, generated code, and last values',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      }));
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case 'registered':
          console.log(`[PropertyRC] Registered as "${msg.clientId}"`);
          registered = true;
          updateStatus(`PropertyRC: connected (${msg.clientId})`, true);
          break;

        case 'tool_call':
          handleToolCall(msg);
          break;

        case 'chat_response': {
          const pending = pendingChats.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            pendingChats.delete(msg.requestId);
            pending.resolve(msg.payload);
          }
          break;
        }

        case 'chat_error': {
          const pending = pendingChats.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            pendingChats.delete(msg.requestId);
            pending.reject(new Error(msg.error || 'Chat failed'));
          }
          break;
        }

        case 'error':
          console.error('[PropertyRC] Server error:', msg.message);
          updateStatus(`PropertyRC: error — ${msg.message}`, false);
          break;
      }
    };

    ws.onclose = () => {
      registered = false;
      if (intentionalClose) {
        updateStatus('PropertyRC: disconnected', false);
        return;
      }
      const sec = (reconnectDelay / 1000).toFixed(0);
      console.log(`[PropertyRC] Disconnected, reconnecting in ${sec}s...`);
      updateStatus(`PropertyRC: reconnecting in ${sec}s...`, false);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    };

    ws.onerror = (err) => {
      console.error('[PropertyRC] WebSocket error:', err);
    };
  }

  async function handleToolCall(msg) {
    const { callId, tool, arguments: args } = msg;

    switch (tool) {
      case 'addProperty': {
        if (!args.name || !args.prompt) {
          sendResult(callId, [{ type: 'text', text: 'Missing required: name and prompt' }], true);
          return;
        }
        try {
          const result = await resolveProperty(args.name, args.prompt);
          if (result.error) {
            sendResult(callId, [{ type: 'text', text: JSON.stringify(result, null, 2) }], true);
          } else {
            sendResult(callId, [{ type: 'text', text: JSON.stringify(result, null, 2) }], false);
          }
        } catch (err) {
          sendResult(callId, [{ type: 'text', text: `Error: ${err.message}` }], true);
        }
        break;
      }

      case 'getProperty': {
        const prop = properties[args.name];
        if (!prop) {
          sendResult(callId, [{ type: 'text', text: `Property "${args.name}" not found` }], true);
          return;
        }
        try {
          const freshValue = eval(prop.code);
          const text = typeof freshValue === 'object' ? JSON.stringify(freshValue) : String(freshValue);
          sendResult(callId, [{ type: 'text', text }], false);
        } catch (err) {
          sendResult(callId, [{ type: 'text', text: `Eval error: ${err.message}` }], true);
        }
        break;
      }

      case 'listProperties': {
        const list = Object.entries(properties).map(([name, p]) => ({
          name,
          prompt: p.prompt,
          code: p.code,
          lastValue: typeof p.value === 'object' ? JSON.stringify(p.value) : String(p.value),
          resolvedAt: p.resolvedAt,
        }));
        sendResult(callId, [{ type: 'text', text: JSON.stringify(list, null, 2) }], false);
        break;
      }

      default:
        sendResult(callId, [{ type: 'text', text: `Unknown tool: ${tool}` }], true);
    }
  }

  function sendResult(callId, content, isError) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'tool_result', callId, content, isError }));
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reconnectDelay = RECONNECT_BASE_MS;
      connect();
    }
  });

  window.addEventListener('beforeunload', () => {
    intentionalClose = true;
    if (ws) ws.close();
  });

  connect();
  console.log('[PropertyRC] Property broker-client injected');
})();
