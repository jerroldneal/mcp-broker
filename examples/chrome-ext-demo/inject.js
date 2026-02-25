/**
 * Injected Broker-Client
 *
 * When injected into the clock page, this script:
 *   1. Connects to the broker (WebSocket, port 3099)
 *   2. Publishes a "clickAnnounce" tool
 *   3. When clickAnnounce is called (by any MCP client), it finds and clicks
 *      the Announce button on the page — which triggers the MCP client flow
 *      to kokoro-tts.
 *
 * This means:
 *   - The INJECTED CODE is a broker-client (publishes tools via WebSocket)
 *   - The CLOCK PAGE calls kokoro-tts REST API to speak the time
 *   - External MCP clients can trigger the announce via the broker
 */

(function () {
  'use strict';

  if (window.__rcInjected) {
    console.log('[RC] Already injected, skipping');
    updateStatus('RC: already injected', true);
    return;
  }
  window.__rcInjected = true;

  const RC_SERVER_URL = 'ws://localhost:3099';
  const CLIENT_ID = 'clock-page';
  const RECONNECT_BASE_MS = 2000;
  const RECONNECT_MAX_MS = 30000;

  let ws = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  let intentionalClose = false;

  function updateStatus(text, connected) {
    const el = document.getElementById('rc-status');
    if (el) {
      el.textContent = text;
      el.className = connected ? 'rc-connected' : 'rc-disconnected';
    }
  }

  // ── Announce function ────────────────────────────────────────────────────

  function announce() {
    const btn = document.getElementById('announce-btn');
    if (btn) {
      btn.click();
      return 'Announce button clicked';
    }
    return 'Announce button not found';
  }

  window.__announce = announce;

  // ── WebSocket Broker-Client ─────────────────────────────────────────────

  function connect() {
    if (intentionalClose) return;
    updateStatus('RC: connecting...', false);

    ws = new WebSocket(RC_SERVER_URL);

    ws.onopen = () => {
      console.log('[RC] Connected to broker');
      reconnectDelay = RECONNECT_BASE_MS;
      ws.send(JSON.stringify({
        type: 'register',
        clientId: CLIENT_ID,
        tools: [
          {
            name: 'clickAnnounce',
            description: 'Clicks the Announce button on the clock page, which speaks the current PST time via kokoro-tts',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'getTime',
            description: 'Returns the current PST time displayed on the clock page',
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
          console.log(`[RC] Registered as "${msg.clientId}"`);
          updateStatus(`RC: connected (${msg.clientId})`, true);
          break;
        case 'tool_call':
          handleToolCall(msg);
          break;
        case 'error':
          console.error('[RC] Server error:', msg.message);
          updateStatus(`RC: error — ${msg.message}`, false);
          break;
      }
    };

    ws.onclose = () => {
      if (intentionalClose) {
        updateStatus('RC: disconnected', false);
        return;
      }
      const delaySec = (reconnectDelay / 1000).toFixed(0);
      console.log(`[RC] Disconnected, reconnecting in ${delaySec}s...`);
      updateStatus(`RC: reconnecting in ${delaySec}s...`, false);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    };

    ws.onerror = (err) => {
      console.error('[RC] WebSocket error:', err);
    };
  }

  function handleToolCall(msg) {
    const { callId, tool, arguments: args } = msg;

    switch (tool) {
      case 'clickAnnounce': {
        const result = announce();
        sendResult(callId, [{ type: 'text', text: result }], false);
        break;
      }
      case 'getTime': {
        const clockEl = document.getElementById('clock');
        const time = clockEl ? clockEl.textContent : 'Clock element not found';
        sendResult(callId, [{ type: 'text', text: time }], false);
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

  // ── Visibility handling — pause reconnect when page hidden ───────────────

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // Page became visible — if disconnected, reconnect immediately
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reconnectDelay = RECONNECT_BASE_MS;
      connect();
    }
  });

  // ── Cleanup on page unload ──────────────────────────────────────────────

  window.addEventListener('beforeunload', () => {
    intentionalClose = true;
    if (ws) ws.close();
  });

  // ── Start ────────────────────────────────────────────────────────────────

  connect();
  console.log('[RC] Broker client injected into clock page');
})();
