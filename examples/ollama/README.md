# Ollama

A broker-client that wraps the local Ollama API as an MCP tool. Any MCP client can call `generate` to get LLM responses without knowing about Ollama.

## Files

| File | Description |
|------|-------------|
| `ollama-rc.js` | Broker client that publishes a `generate` tool calling the Ollama REST API |

## Prerequisites

- **Ollama** running locally (`ollama serve` — default port 11434)

## Quick Start

```bash
# Terminal 1 — Start the broker
npm run broker

# Terminal 2 — Start the Ollama broker-client
npm run example:ollama
```

Then from any MCP client, call `ollama__generate` with a `prompt` argument.

## npm Scripts

| Script | Command |
|--------|---------|
| `npm run example:ollama` | Starts the Ollama broker-client |

## How It Works

The broker-client connects to the broker, publishes a `generate` tool, and waits for calls. When a call arrives, it POSTs to the Ollama `/api/generate` endpoint and returns the response text.

```
MCP Client → HTTP → broker → WS → ollama RC → Ollama API → response
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Default model for generation |
| `BROKER_WS_URL` | `ws://localhost:3099` | WebSocket URL of the broker |
