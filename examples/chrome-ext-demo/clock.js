/**
 * Clock page logic
 *
 * - Updates PST clock every second
 * - Announce button: calls kokoro-tts REST API to speak the current time
 * - Auto-injects the broker-client on load (no manual popup click needed)
 * - Polls the MCP server (Streamable HTTP) and displays available tools
 *
 * The MCP browser client now uses Streamable HTTP — POST JSON-RPC to /mcp.
 * Each request is a standalone round-trip (stateless server mode).
 */

const KOKORO_URL = 'http://localhost:3021';
const MCP_SERVER_URL = 'http://localhost:3098/mcp';
const TOOL_POLL_INTERVAL_MS = 5000;

const clockEl = document.getElementById('clock');
const announceBtn = document.getElementById('announce-btn');
const statusEl = document.getElementById('status');
const serverStatusEl = document.getElementById('server-status');

// ── Clock ────────────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  const pst = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);
  clockEl.textContent = pst;
}

updateClock();
setInterval(updateClock, 1000);

// ── Announce ─────────────────────────────────────────────────────────────────

async function announce() {
  const timeText = clockEl.textContent;
  announceBtn.disabled = true;
  statusEl.textContent = 'Sending to kokoro-tts...';

  try {
    const res = await fetch(`${KOKORO_URL}/api/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `The current Pacific time is ${timeText}`,
        speed: 1.1,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    statusEl.textContent = `Announced: ${timeText}`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error('Announce failed:', err);
  } finally {
    announceBtn.disabled = false;
  }
}

announceBtn.addEventListener('click', announce);
window.__clockAnnounce = announce;

// ── Auto-inject broker-client ───────────────────────────────────────────────

(function autoInject() {
  if (window.__rcInjected) return;
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
    console.log('[Clock] Not running as extension — skipping auto-inject');
    return;
  }
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = () => console.log('[Clock] Broker client auto-injected');
  script.onerror = () => console.error('[Clock] Failed to auto-inject broker-client');
  document.head.appendChild(script);
})();

// ── Listen for inject message from popup (fallback) ──────────────────────────

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'inject-rc') {
    if (window.__rcInjected) {
      sendResponse({ ok: true, note: 'already injected' });
      return;
    }
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => sendResponse({ ok: true });
    script.onerror = () => sendResponse({ error: 'Failed to load inject.js' });
    document.head.appendChild(script);
    return true;
  }
});
}

// ── MCP Server health & tool polling ─────────────────────────────────────────

let mcpClient = null;
let lastToolsJson = '';
const toolsContainerEl = document.getElementById('tools-container');
const refreshBtn = document.getElementById('refresh-tools');
const renderToolsCallbacks = [];

async function pollServerTools() {
  try {
    // Check if server is reachable
    const alive = await McpBrowserClient.ping(MCP_SERVER_URL);
    if (!alive) {
      serverStatusEl.textContent = 'Server: offline';
      serverStatusEl.className = 'server-down';
      renderTools([]);
      return;
    }

    serverStatusEl.textContent = 'Server: online';
    serverStatusEl.className = 'server-up';

    // Connect MCP client (stateless, so connect every time is fine)
    mcpClient = new McpBrowserClient(MCP_SERVER_URL);
    await mcpClient.connect();
    const tools = await mcpClient.listTools();

    renderTools(tools);
  } catch (err) {
    console.error('[Clock] MCP poll error:', err);
    serverStatusEl.textContent = 'Server: error';
    serverStatusEl.className = 'server-down';
    renderTools([]);
  }
}

function renderTools(tools) {
  const json = JSON.stringify(tools.map(t => t.name));
  if (json === lastToolsJson) return; // skip redundant DOM updates
  lastToolsJson = json;

  // Notify listeners (e.g. Properties tab)
  for (const cb of renderToolsCallbacks) cb(tools);

  toolsContainerEl.innerHTML = '';
  if (tools.length === 0) {
    const span = document.createElement('span');
    span.id = 'tools-empty';
    span.textContent = 'No tools available (server offline or no broker-clients)';
    toolsContainerEl.appendChild(span);
    return;
  }

  for (const tool of tools) {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.innerHTML =
      `<span class="tool-name">${tool.name}</span>` +
      (tool.description ? `<span class="tool-desc">${tool.description}</span>` : '');
    btn.addEventListener('click', () => callTool(tool.name, btn));
    toolsContainerEl.appendChild(btn);
  }
}

async function callTool(name, btn) {
  // Remove any previous result below this button
  const next = btn.nextElementSibling;
  if (next && (next.classList.contains('tool-result') || next.classList.contains('tool-error'))) {
    next.remove();
  }

  btn.disabled = true;
  try {
    if (!mcpClient || !mcpClient._ready) {
      mcpClient = new McpBrowserClient(MCP_SERVER_URL);
      await mcpClient.connect();
    }
    const result = await mcpClient.callTool(name, {});
    const text = (result.content || []).map(c => c.text).join(' ');
    const el = document.createElement('div');
    el.className = 'tool-result';
    el.textContent = `\u21b3 ${text}`;
    btn.after(el);
  } catch (err) {
    const el = document.createElement('div');
    el.className = 'tool-error';
    el.textContent = `\u21b3 ${err.message}`;
    btn.after(el);
  } finally {
    btn.disabled = false;
  }
}

// Refresh button
refreshBtn.addEventListener('click', () => {
  lastToolsJson = ''; // force re-render
  pollServerTools();
});

// Initial poll + interval
pollServerTools();
setInterval(pollServerTools, TOOL_POLL_INTERVAL_MS);

// ── Ollama Inference via MCP ─────────────────────────────────────────────────

const ollamaPromptEl = document.getElementById('ollama-prompt');
const ollamaSendBtn = document.getElementById('ollama-send');
const ollamaResponseEl = document.getElementById('ollama-response');
const ollamaStatusEl = document.getElementById('ollama-status');

async function sendOllamaPrompt() {
  const prompt = ollamaPromptEl.value.trim();
  if (!prompt) return;

  ollamaSendBtn.disabled = true;
  ollamaResponseEl.value = '';
  ollamaStatusEl.textContent = 'Sending to ollama via MCP...';

  try {
    const client = new McpBrowserClient(MCP_SERVER_URL);
    await client.connect();
    const result = await client.callTool('ollama__generate', { prompt });
    const text = (result.content || []).map(c => c.text).join('');
    ollamaResponseEl.value = text || '(empty response)';
    ollamaStatusEl.textContent = 'Done';
  } catch (err) {
    ollamaResponseEl.value = '';
    ollamaStatusEl.textContent = `Error: ${err.message}`;
    console.error('[Ollama] Inference failed:', err);
  } finally {
    ollamaSendBtn.disabled = false;
  }
}

ollamaSendBtn.addEventListener('click', sendOllamaPrompt);
ollamaPromptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendOllamaPrompt();
  }
});

// ── Tab Switching ────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ── Auto-inject property broker-client ──────────────────────────────────────

(function autoInjectPropertyRc() {
  if (window.__propertyRcInjected) return;
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
    console.log('[Clock] Not running as extension — skipping property-rc auto-inject');
    return;
  }
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('property-rc.js');
  script.onload = () => console.log('[Clock] Property broker-client auto-injected');
  script.onerror = () => console.error('[Clock] Failed to auto-inject property-rc');
  document.head.appendChild(script);
})();

// ── Properties Tab Logic ─────────────────────────────────────────────────────

const propToolSelect = document.getElementById('prop-tool-select');
const propNameInput = document.getElementById('prop-name-input');
const propPromptInput = document.getElementById('prop-prompt-input');
const propAddBtn = document.getElementById('prop-add-btn');
const propStatusEl = document.getElementById('prop-status');
const propLogEntries = document.getElementById('prop-log-entries');
const propListContainer = document.getElementById('prop-list-container');

// Populate tool pulldown from MCP tools (filter to addProperty-capable tools)
let availableTools = [];

function updateToolPulldown(tools) {
  availableTools = tools;
  propToolSelect.innerHTML = '';
  const addPropTools = tools.filter(t => t.name.endsWith('__addProperty'));
  if (addPropTools.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No addProperty tools available';
    propToolSelect.appendChild(opt);
    return;
  }
  for (const tool of addPropTools) {
    const opt = document.createElement('option');
    opt.value = tool.name;
    opt.textContent = tool.name;
    propToolSelect.appendChild(opt);
  }
}

// Hook into tool polling — update pulldown whenever tools refresh
renderToolsCallbacks.push(updateToolPulldown);

// Add Property
propAddBtn.addEventListener('click', async () => {
  const toolName = propToolSelect.value;
  const name = propNameInput.value.trim();
  const prompt = propPromptInput.value.trim();
  if (!toolName) { propStatusEl.textContent = 'Select a tool first'; return; }
  if (!name) { propStatusEl.textContent = 'Enter a property name'; return; }
  if (!prompt) { propStatusEl.textContent = 'Enter a prompt'; return; }

  propAddBtn.disabled = true;
  propStatusEl.textContent = 'Calling addProperty — iterative AI conversation in progress...';
  clearLog();

  try {
    const client = new McpBrowserClient(MCP_SERVER_URL);
    await client.connect();
    const result = await client.callTool(toolName, { name, prompt });
    const text = (result.content || []).map(c => c.text).join('');
    propStatusEl.textContent = result.isError ? `Error: ${text}` : `Done! Property "${name}" added.`;
    refreshPropertyList();
  } catch (err) {
    propStatusEl.textContent = `Error: ${err.message}`;
  } finally {
    propAddBtn.disabled = false;
  }
});

// Conversation log from property-rc
function clearLog() {
  propLogEntries.innerHTML = '';
}

function appendLog(entry) {
  const emptyEl = document.getElementById('prop-log-empty');
  if (emptyEl) emptyEl.remove();

  const div = document.createElement('div');
  div.className = 'log-entry';

  switch (entry.phase) {
    case 'start':
      div.innerHTML = `<span class="log-phase">▶ START</span> <span class="log-detail">Adding property "${esc(entry.name)}" — "${esc(entry.prompt)}"</span>`;
      break;
    case 'asking_requirements':
      div.innerHTML = `<span class="log-phase">🔍 ASKING AI</span> <span class="log-detail">What info do you need?</span>`;
      break;
    case 'requirements_received':
      div.innerHTML = `<span class="log-phase">📋 CHECKLIST</span><pre class="log-detail" style="white-space:pre-wrap;margin:4px 0;">${esc(entry.content)}</pre>`;
      break;
    case 'gathering':
      div.innerHTML = `<span class="log-phase">📡 GATHER #${entry.index}</span> <span class="log-detail">${esc(entry.item)}</span>`;
      break;
    case 'expression_received':
      div.innerHTML = `<span class="log-phase">🧪 EVAL #${entry.index}</span> <span class="log-code">${esc(entry.expression)}</span>`;
      break;
    case 'data_gathered':
      div.innerHTML = `<span class="log-phase">✅ DATA #${entry.index}</span> <span class="log-code">${esc(entry.result)}</span>`;
      break;
    case 'requesting_code':
      div.innerHTML = `<span class="log-phase">🤖 GENERATING CODE</span> <span class="log-detail">All data gathered, requesting final expression</span>`;
      break;
    case 'code_received':
      div.innerHTML = `<span class="log-phase">💡 CODE</span> <span class="log-code">${esc(entry.code)}</span>`;
      break;
    case 'complete':
      div.innerHTML = `<span class="log-phase">🎉 DONE</span> <span class="log-detail">${esc(entry.name)} = </span><span class="log-code">${esc(entry.value)}</span>`;
      break;
    case 'error':
    case 'eval_error':
    case 'gather_error':
      div.innerHTML = `<span class="log-error">❌ ${esc(entry.phase.toUpperCase())}: ${esc(entry.error || entry.message || '')}</span>`;
      break;
    case 'warning':
      div.innerHTML = `<span class="log-phase">⚠️ WARNING</span> <span class="log-detail">${esc(entry.message)}</span>`;
      break;
    default:
      div.innerHTML = `<span class="log-phase">${esc(entry.phase)}</span> <span class="log-detail">${esc(JSON.stringify(entry))}</span>`;
  }
  propLogEntries.appendChild(div);
  propLogEntries.scrollTop = propLogEntries.scrollHeight;
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Listen for log events from property-rc
window.addEventListener('property-log', (e) => appendLog(e.detail));

// Refresh resolved properties list
function refreshPropertyList() {
  const props = window.__properties || {};
  propListContainer.innerHTML = '';
  const names = Object.keys(props);
  if (names.length === 0) {
    propListContainer.innerHTML = '<span id="prop-list-empty" style="color:#475569;font-style:italic;">No properties yet</span>';
    return;
  }
  for (const name of names) {
    const p = props[name];
    const div = document.createElement('div');
    div.className = 'prop-item';
    const valStr = typeof p.value === 'object' ? JSON.stringify(p.value) : String(p.value);
    div.innerHTML =
      `<span class="prop-name">${esc(name)}</span> = <span class="prop-value">${esc(valStr)}</span>` +
      `<div class="prop-prompt-text">"${esc(p.prompt)}" — code: <code>${esc(p.code)}</code></div>`;
    propListContainer.appendChild(div);
  }
}
