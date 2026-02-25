/**
 * Popup logic
 *
 * - Checks MCP server health on open
 * - Checks if clock page is already open
 * - "Open Clock Page" opens clock.html (auto-injects RC on load)
 * - "Inject Broker-Client" sends a message to the clock page (fallback)
 * - Loads MCP tools and shows a button for each one
 */

const MCP_SERVER_URL = 'http://localhost:3098/mcp';
const statusEl = document.getElementById('status');
const healthHttpEl = document.getElementById('health-http');
const healthClockEl = document.getElementById('health-clock');
const toolsContainer = document.getElementById('tools-container');

let mcpClient = null;

// ── Health checks on popup open ──────────────────────────────────────────────

async function checkHealth() {
  let serverOnline = false;

  // Check MCP server
  try {
    const res = await fetch(MCP_SERVER_URL, { method: 'GET' });
    if (res.status === 405 || res.ok) {
      healthHttpEl.innerHTML = '<span class="dot dot-green"></span>online (:3098)';
      serverOnline = true;
    } else {
      healthHttpEl.innerHTML = '<span class="dot dot-red"></span>offline';
    }
  } catch {
    healthHttpEl.innerHTML = '<span class="dot dot-red"></span>offline';
  }

  // Check if clock page is open
  const clockUrl = chrome.runtime.getURL('clock.html');
  const tabs = await chrome.tabs.query({ url: clockUrl });
  if (tabs.length > 0) {
    healthClockEl.innerHTML = '<span class="dot dot-green"></span>open';
  } else {
    healthClockEl.innerHTML = '<span class="dot dot-red"></span>not open';
  }

  // Load tools if server is online
  if (serverOnline) {
    await loadTools();
  } else {
    toolsContainer.innerHTML = '<span id="tools-loading">Server offline</span>';
  }
}

// ── Load and render MCP tools ────────────────────────────────────────────────

async function loadTools() {
  try {
    mcpClient = new McpBrowserClient(MCP_SERVER_URL);
    await mcpClient.connect();
    const tools = await mcpClient.listTools();

    if (tools.length === 0) {
      toolsContainer.innerHTML = '<span id="tools-loading">No tools registered</span>';
      return;
    }

    toolsContainer.innerHTML = '';
    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.innerHTML =
        `<span class="tool-name">${tool.name}</span>` +
        (tool.description ? `<span class="tool-desc">${tool.description}</span>` : '');
      btn.addEventListener('click', () => callTool(tool.name, btn));
      toolsContainer.appendChild(btn);
    }
  } catch (err) {
    toolsContainer.innerHTML = `<span class="tool-error">Failed to load tools: ${err.message}</span>`;
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
    const result = await mcpClient.callTool(name, {});
    const text = (result.content || []).map(c => c.text).join(' ');
    const el = document.createElement('div');
    el.className = 'tool-result';
    el.textContent = `↳ ${text}`;
    btn.after(el);
  } catch (err) {
    const el = document.createElement('div');
    el.className = 'tool-error';
    el.textContent = `↳ ${err.message}`;
    btn.after(el);
  } finally {
    btn.disabled = false;
  }
}

checkHealth();

// ── Refresh tools button ─────────────────────────────────────────────────────

document.getElementById('refresh-tools').addEventListener('click', () => {
  toolsContainer.innerHTML = '<span id="tools-loading">Refreshing...</span>';
  mcpClient = null;
  loadTools();
});

// ── Open clock page ──────────────────────────────────────────────────────────

document.getElementById('open-clock').addEventListener('click', async () => {
  const clockUrl = chrome.runtime.getURL('clock.html');
  const existing = await chrome.tabs.query({ url: clockUrl });
  if (existing.length > 0) {
    // Focus existing tab instead of opening duplicate
    chrome.tabs.update(existing[0].id, { active: true });
    chrome.windows.update(existing[0].windowId, { focused: true });
    statusEl.textContent = 'Focused existing clock tab';
  } else {
    chrome.tabs.create({ url: clockUrl });
    statusEl.textContent = 'Clock page opened (RC auto-injects)';
  }
  // Refresh health after short delay
  setTimeout(checkHealth, 500);
});

// ── Inject broker-client (fallback for manual re-inject) ────────────────────

document.getElementById('inject-rc').addEventListener('click', () => {
  const btn = document.getElementById('inject-rc');
  btn.disabled = true;
  statusEl.textContent = 'Sending inject message...';

  chrome.runtime.sendMessage({ type: 'inject-rc' }, (response) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = 'Clock page not open. Open it first!';
      btn.disabled = false;
      return;
    }
    if (response && response.ok) {
      statusEl.textContent = response.note === 'already injected'
        ? '✅ Already injected'
        : '✅ Broker client injected!';
    } else {
      statusEl.textContent = response?.error || 'No response from clock page';
      btn.disabled = false;
    }
  });
});
