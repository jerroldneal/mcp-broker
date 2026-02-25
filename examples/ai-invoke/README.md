# AI Invoke

A broker-client that publishes an `invoke` tool. When called with a natural language instruction, it asks the AI to generate JavaScript code, evaluates it, and returns the result.

## Files

| File | Description |
|------|-------------|
| `ai-invoke-rc.js` | Broker client that publishes the `invoke` tool — generates and evals AI code |
| `ai-caller.js` | MCP client that calls `invoke` with sample instructions |

## Prerequisites

- **Ollama** running locally (`ollama serve`)
- **Ollama MCP server** on port 3042

## Quick Start

```bash
# Terminal 1 — Start the broker
npm run broker

# Terminal 2 — Start the AI invoke broker-client
npm run example:ai-invoke

# Terminal 3 — Run the caller
npm run example:ai-caller
```

## npm Scripts

| Script | Command |
|--------|---------|
| `npm run example:ai-invoke` | Starts the AI invoke broker-client |
| `npm run example:ai-caller` | Runs the MCP client caller |

## How It Works

```
MCP Client (ai-caller)
  → HTTP → broker (broker)
    → WS → ai-invoke RC
      → rc.chat() → broker → Ollama MCP server → Ollama
      ← generated JavaScript code
      → eval(code)
      ← result
    ← tool response
  ← MCP result
```

The `invoke` tool uses `rc.chat()` to ask the AI to generate pure JavaScript, then evaluates it in the Node.js environment and returns the result. The RC never talks to Ollama directly — everything goes through the broker's chat proxy.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_MODEL` | `llama3.2` | Model to use for code generation |
| `BROKER_WS_URL` | `ws://localhost:3099` | WebSocket URL of the broker |
