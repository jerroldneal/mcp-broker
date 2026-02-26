// Quick test: call ask_ai via MCP broker HTTP (streaming SSE)
const body = JSON.stringify({
  jsonrpc: '2.0',
  method: 'tools/call',
  params: { name: 'ask_ai', arguments: { prompt: 'What should I do with pocket aces pre-flop in Texas Hold em? Answer in 2 sentences.', speak: true } },
  id: 1
});

const controller = new AbortController();
setTimeout(() => controller.abort(), 30000);

const r = await fetch('http://localhost:3098/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  },
  body,
  signal: controller.signal
});

console.log('Status:', r.status, 'Content-Type:', r.headers.get('content-type'));

// Read SSE events line by line
const reader = r.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep incomplete line
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const data = JSON.parse(line.slice(5).trim());
      console.log('RESULT:', JSON.stringify(data.result || data.error, null, 2));
      controller.abort(); // got our answer, stop
      process.exit(0);
    }
  }
}
console.log('Stream ended without data');
