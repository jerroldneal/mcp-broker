const { spawn } = require('child_process');
const c = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: 'ignore',
  detached: true
});
c.unref();
console.log('Started server.js as PID ' + c.pid);
process.exit(0);
