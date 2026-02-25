// Quick test: call Ollama directly to verify it responds
import http from 'http';

const data = JSON.stringify({
  model: 'qwen2.5:0.5b',
  prompt: 'What is 2+2? Answer with just the number.',
  stream: false,
});

console.log('Calling Ollama directly at localhost:11434...');
const start = Date.now();

const req = http.request(
  {
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  },
  (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Response (${elapsed}s):`, body.slice(0, 500));
      process.exit(0);
    });
  }
);
req.on('error', (e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
req.write(data);
req.end();
