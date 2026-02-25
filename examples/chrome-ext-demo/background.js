/**
 * Background service worker
 *
 * - Routes messages between popup and clock page
 * - Provides server health check API
 */

const MCP_SERVER_URL = 'http://localhost:3098/mcp';
const WS_SERVER_PORT = 3099;

chrome.runtime.onInstalled.addListener(() => {
  console.log('[RC Clock Demo] Extension installed');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'server-health') {
    checkServerHealth().then(sendResponse);
    return true; // async response
  }
});

async function checkServerHealth() {
  const result = { http: false, ws: false };
  try {
    // HTTP MCP endpoint — GET returns 405 (expected), meaning it's alive
    const res = await fetch(MCP_SERVER_URL, { method: 'GET' });
    result.http = (res.status === 405 || res.ok);
  } catch { /* unreachable */ }
  // WebSocket health: we can't easily test from service worker without
  // keeping a connection open; rely on the inject.js status for that.
  result.ws = result.http; // assume same server
  return result;
}
