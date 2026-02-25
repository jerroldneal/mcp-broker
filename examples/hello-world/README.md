# Hello World

The foundational example — a broker-client publishes two tools (`greet`, `add`) and a standard MCP client calls them through the broker.

## Files

| File | Description |
|------|-------------|
| `broker-client.js` | Connects to the broker via WebSocket and publishes `greet` and `add` tools |
| `mcp-client.js` | Standard MCP client that connects via HTTP, lists tools, and calls `greet` + `add` |
| `demo.js` | All-in-one demo — starts server, broker-client, and MCP client in a single process |
| `demo-stepwise.js` | Orchestrates the 3-terminal demo (server → RC → client) in one command |
| `serve.js` | Starts the server + broker-client together for manual testing |

## Quick Start

### Option A: All-in-one demo

```bash
npm run demo
```

### Option B: Step-by-step (3 terminals)

```bash
# Terminal 1 — Start the broker (from mcp-broker root)
npm run dev

# Terminal 2 — Start the broker-client (from examples/)
npm run broker-client

# Terminal 3 — Run the MCP client (from examples/)
npm run client
```

### Option C: Stepwise orchestrator

```bash
npm run demo:stepwise
```

## npm Scripts

| Script | Command |
|--------|---------|
| `npm run demo` | Runs the all-in-one demo |
| `npm run demo:stepwise` | Runs the step-by-step orchestrator |
| `npm run broker-client` | Starts just the broker-client |
| `npm run client` | Runs just the MCP client |
| `npm run serve` | Starts server + broker-client together |

## What It Demonstrates

1. **Broker client registration** — a process connects via WebSocket and publishes tools
2. **Tool namespacing** — tools appear as `hello-world__greet`, `hello-world__add`
3. **Standard MCP client consumption** — the client has no idea it's talking to broker-clients; it just sees normal MCP tools
