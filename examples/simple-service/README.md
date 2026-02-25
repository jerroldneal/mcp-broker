# Simple Service

A minimal broker-client that runs as a long-lived service. The simplest possible starting point for building your own broker-client.

## Files

| File | Description |
|------|-------------|
| `simple-service.js` | Long-running broker-client with three tools: `ping`, `exit`, `chat` |

## Quick Start

```bash
# Terminal 1 — Start the broker
npm run broker

# Terminal 2 — Start the service
npm run example:service
```

Then call its tools from any MCP client connected to `http://localhost:3098/mcp`.

## npm Scripts

| Script | Command |
|--------|---------|
| `npm run example:service` | Starts the service |

## Tools

| Tool | Description |
|------|-------------|
| `ping` | Returns `pong` with a timestamp — useful for health checks |
| `exit` | Gracefully shuts down the service (disconnects and exits) |
| `chat` | Sends a prompt to the AI via the broker's chat proxy and returns the response |

## What It Demonstrates

- **Long-lived service** — stays running until Ctrl+C or the `exit` tool is called
- **Auto-reconnect** — reconnects automatically if the server restarts
- **Graceful shutdown** — handles SIGINT and the `exit` tool cleanly
- **Chat proxy** — the `chat` tool uses `rc.chat()` to reach the AI through the broker without any direct Ollama dependency
