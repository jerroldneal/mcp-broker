// Test mcpCall to kokoro-tts from inside the container (SSE streaming)
const url = process.env.KOKORO_MCP_URL || 'http://host.docker.internal:3021/mcp';
console.log('Testing speak to:', url);

const controller = new AbortController();
setTimeout(() => controller.abort(), 15000);

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  },
  signal: controller.signal,
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: 'speak', arguments: { text: 'Hello from broker test' } },
    id: 1
  }),
}).then(async r => {
  console.log('status:', r.status);
  console.log('content-type:', r.headers.get('content-type'));
  if (r.status !== 200) {
    const body = await r.text();
    console.log('error body:', body.substring(0, 500));
    process.exit(1);
  }
  // Read SSE response incrementally
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data:')) {
        console.log('DATA:', line.slice(5).trim().substring(0, 200));
        controller.abort();
        process.exit(0);
      }
    }
  }
  console.log('stream ended');
}).catch(e => console.log('error:', e.message));
