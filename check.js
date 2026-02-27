var c = require('fs').readFileSync('/app/server.js', 'utf8');
console.log('has_ask_ai:', c.includes('ask_ai'));
console.log('has_mcpCall:', c.includes('async function mcpCall'));
console.log('has_event_stream:', c.includes('text/event-stream'));
console.log('has_SSE_parse:', c.includes('SSE response'));
console.log('lines:', c.split('\n').length);
