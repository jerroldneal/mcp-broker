# MCP Broker

> **Repo**: [`jerroldneal/mcp-broker`](https://github.com/jerroldneal/mcp-broker) · **Submodule of**: [`chrome-native-relay`](https://github.com/jerroldneal/chrome-native-relay) at `mcp-broker/`

An MCP server that acts as a **tool-routing broker** — tool providers connect outbound via WebSocket and publish tools, while standard MCP clients consume them transparently through the broker.

## How It Works

```
┌──────────────┐  HTTP (MCP)  ┌──────────────────────┐   WebSocket    ┌──────────────────┐
│  MCP Client  │ ◄──────────► │  MCP Broker          │ ◄────────────► │  Tool Provider   │
│  (any)       │  :3098/mcp   │                      │    :3099       │  (broker client) │
└──────────────┘              │  - tool registry     │                └──────────────────┘
                              │  - call routing      │   WebSocket    ┌──────────────────┐
                              │  - namespacing       │ ◄────────────► │  Tool Provider   │
                              │                      │                │  (broker client) │
                              └──────────────────────┘                └──────────────────┘
```

**Normal MCP clients** connect via Streamable HTTP (`http://localhost:3098/mcp`) and see a standard MCP server.
**Broker clients** (tool providers) connect outbound via WebSocket (`ws://localhost:3099`), register tools, and handle calls routed from MCP clients.

## Quick Start

```bash
cd mcp-broker
npm install
npm run dev
# Server listening:  HTTP MCP on :3098  |  WebSocket on :3099
```

## Examples

Examples are organized into folders by use case:

```
examples/
  list-tools.js          ← General utility: list all connected clients & tools
  hello-world/           ← Basic greet/add demo with orchestrators
  simple-service/        ← Minimal long-running service (ping, chat, exit)
  ai-invoke/             ← AI code generation via chat proxy
  ollama/                ← Ollama broker-client (generate tool)
  chrome-ext-demo/       ← Chrome extension with clock, properties tab, auto-announcer
```

## Full Demo (all-in-one)

Runs the server, a broker-client, and an MCP client in one command:

```bash
cd examples
npm run demo
```

## Step-by-Step Demo (single command)

Runs the same 3-terminal flow (server → broker-client → MCP client) orchestrated as one process:

```bash
cd examples
npm run demo:stepwise
```

This starts the server, waits for it, starts the broker-client, waits for registration, then runs the MCP client — all with automatic cleanup.

## Serve Mode

Starts the server + sample broker-client together, staying alive for interactive use:

```bash
cd examples
npm run serve
# Both running. Now use another command or the Chrome extension.
```

Useful when you want the server running for:
- The Chrome extension demo (see below)
- Manual `npm run client` testing (from `examples/`)
- The auto-announcer (`npm run auto-announce` from `examples/`)

## Step-by-Step Demo (manual, 3 terminals)

### 1. Start the server

```bash
npm run dev
# [broker] WebSocket server listening on port 3099
# [broker] MCP HTTP server listening on http://localhost:3098/mcp
```

### 2. Start a broker-client (publishes tools)

In a second terminal:

```bash
cd examples
npm run broker-client
# Broker client "hello-world" connected — publishing greet, add
```

### 3. Use an MCP client to call those tools

In a third terminal:

```bash
cd examples
npm run client
# Connects to http://localhost:3098/mcp
# Lists tools: hello-world__greet, hello-world__add, list_broker_clients
# Calls greet and add — results printed
```

## Chrome Extension Demo

A full browser demo: a Chrome extension with a PST clock page that auto-injects a broker-client, speaks the time via kokoro-tts, polls the MCP server for live tool status, and publishes tools callable by any MCP client.

### Features

- **Auto-inject**: Broker client connects on page load — no manual popup click needed
- **Streamable HTTP MCP browser client**: The clock page polls `http://localhost:3098/mcp` using the rewritten `McpBrowserClient` (fetch POST, stateless)
- **Live tools panel**: Clickable tool buttons with inline results (5s polling)
- **Ollama inference panel**: Prompt input + response textarea — calls LLM through MCP
- **Server health indicators**: Green/red dots for MCP server and broker-client connection
- **Exponential backoff**: WebSocket reconnect starts at 2s, doubles to 30s max
- **Tab visibility handling**: Reconnects immediately when the tab becomes visible
- **Duplicate tab prevention**: Popup focuses existing clock tab instead of opening a new one
- **Two published tools**: `clickAnnounce` (clicks the button) and `getTime` (reads the clock)
- **Properties tab**: Iterative AI property resolution — add named properties via multi-turn AI conversation
- **Property broker-client**: `property-rc.js` publishes `addProperty`, `getProperty`, `listProperties` tools
- **AI conversation log**: Real-time visualization of the iterative gather → generate → eval cycle
- **Refresh button**: Re-poll tools on demand from clock page and popup

### Quick Start (single command)

```bash
cd examples
npm run serve:chrome
```

Starts the MCP broker server + auto-announcer in one process, then prints
instructions for loading the Chrome extension. Once the clock page connects,
the auto-announcer calls `clickAnnounce` every 15s.

### Manual Setup

1. Start the server: `npm run dev`
2. Open `chrome://extensions`, enable **Developer mode**
3. Click **Load unpacked**, select `examples/chrome-ext-demo/`
4. Click the extension icon → **Open Clock Page**
5. The page auto-injects the broker-client (RC status turns green)
6. The tools panel at the bottom shows live MCP tools
7. Server status indicator (top-left) shows online/offline

### Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest, `tabs` permission, CSP for localhost |
| `clock.html` | Clock UI with tabbed layout (Clock / Properties), server status, tools panel, ollama panel |
| `clock.js` | Clock logic, auto-inject (both RCs), tab switching, MCP polling, tool buttons, property form |
| `inject.js` | Broker client: publishes `clickAnnounce` + `getTime` via WS :3099 |
| `property-rc.js` | Property broker-client: publishes `addProperty` + `getProperty` + `listProperties` via WS :3099 |
| `mcp-browser-client.js` | Streamable HTTP MCP client for the browser (fetch POST, SSE parsing) |
| `popup.html` | Popup with health panel, clickable tool buttons, refresh |
| `popup.js` | Health checks, tool loading/calling, tab management |
| `background.js` | Service worker with server health API |
| `auto-announce.js` | Node.js MCP client that calls `clickAnnounce` every 15s |
| `click-announce.js` | One-shot MCP client: lists tools + calls clickAnnounce |
| `serve-chrome.js` | Orchestrator: starts server + auto-announcer in one command |

### Auto-Announcer

A Node.js MCP client that calls `clickAnnounce` every 15 seconds:

```bash
# Requires: server running (npm run dev) + Chrome extension injected
cd examples
npm run auto-announce
# Connects to http://localhost:3098/mcp
# Calls clock-page__clickAnnounce every 15s
# Clock page speaks the current PST time via kokoro-tts
```

### Architecture

```
┌───────────────┐   HTTP MCP    ┌─────────────────┐   WebSocket    ┌─────────────────────┐
│ auto-announce │ ────────────► │  broker-client  │ ◄────────────► │  inject.js          │
│ (MCP client)  │  :3098/mcp   │  server (broker) │    :3099       │  (clock tools RC)   │
└───────────────┘              │                 │                └─────────────────────┘
                                │                 │   WebSocket    ┌─────────────────────┐
┌───────────────┐   HTTP MCP    │                 │ ◄────────────► │  property-rc.js     │
│ clock.js      │ ────────────► │                 │                │  (property agent RC) │
│ (MCP browser  │  :3098/mcp   │                 │                │  → chat_request     │
│  client)      │              │                 │                │  → Ollama MCP :3042 │
└───────────────┘              │                 │                └─────────────────────┘
                                │                 │   WebSocket    ┌─────────────────────┐
                                │                 │ ◄────────────► │  ollama-rc.js       │
                                │                 │    :3099       │  (Ollama RC)        │
                                └─────────────────┘                │  → Ollama :11434    │
                                                                   └─────────────────────┘
```

The clock page acts as **both** an MCP client (via `McpBrowserClient`) and hosts two broker-clients (`inject.js` for clock tools, `property-rc.js` for AI property resolution). When a user types a prompt, the browser calls `ollama__generate` through the MCP broker, which routes the call to the Ollama broker-client.

### Properties Tab — Iterative AI Property Resolution

The Properties tab demonstrates a **customer-service-style AI interaction** pattern. Instead of generating code from a single prompt, the AI asks what information it needs, gathers each requirement from the live page, then generates code with full context.

**How `addProperty` works:**

1. User provides a **name** (e.g. `buttonCount`) and a **prompt** (e.g. "count all buttons on the page")
2. The property-rc sends the prompt to AI via `chat_request` → broker → Ollama MCP
3. AI responds with a **numbered checklist** of questions about the page
4. For each checklist item, the AI suggests a **JS expression** to eval in the browser
5. The expression is eval'd, and the result is fed back to the AI
6. Once all data is gathered, the AI generates a **final expression** with full context
7. The expression is eval'd and stored as a named property (re-evaluable via `getProperty`)

The entire conversation is rendered live in the **AI Conversation Log** panel — every requirement gathered, every expression evaluated, every result captured.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Properties Tab UI                                                         │
│                                                                            │
│  ┌─ Tool Select ─┐  ┌─ Name ──────┐  ┌─ Prompt ─────────────────────────┐ │
│  │ property-agent │  │ buttonCount │  │ count all buttons on the page   │ │
│  └────────────────┘  └─────────────┘  └──────────────────────────────────┘ │
│                                                                            │
│  AI Conversation Log:                                                      │
│  ▶ START  Adding property "buttonCount" — "count all buttons"              │
│  🔍 ASKING AI  What info do you need?                                      │
│  📋 CHECKLIST  1. What framework is the page using?                        │
│                2. Are buttons in shadow DOM?                                │
│  📡 GATHER #1  What framework is the page using?                           │
│  🧪 EVAL #1    typeof React !== 'undefined' ? 'React' : 'vanilla'         │
│  ✅ DATA #1    vanilla                                                     │
│  📡 GATHER #2  Are buttons in shadow DOM?                                  │
│  🧪 EVAL #2    document.querySelector('*').shadowRoot !== null             │
│  ✅ DATA #2    false                                                       │
│  🤖 GENERATING CODE  All data gathered, requesting final expression        │
│  💡 CODE  document.querySelectorAll('button').length                       │
│  🎉 DONE  buttonCount = 3                                                 │
│                                                                            │
│  Resolved Properties:                                                      │
│  buttonCount = 3  ("count all buttons on the page")                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why this pattern matters:**
- The AI doesn't guess — it **inspects the actual page** before generating code
- Each requirement is independently verified with real data
- The conversation log provides full transparency into the AI's reasoning
- Properties are re-evaluable: `getProperty` re-runs the generated code for fresh values
- Demonstrates how broker-clients can use `chat_request` for multi-turn AI conversations

## npm Scripts

### Broker (run from project root)

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `node server.js` | Start the broker server (long-running) |
| `npm run repl` | `node repl.js` | Interactive REPL for the broker |

### Examples (run from `examples/`)

Examples have their own `package.json`. Run them from the `examples/` directory:

```bash
cd examples
npm run <script>
```

| Script | Command | Description |
|---|---|---|
| `npm run ls` | `node list-tools.js` | List connected broker-clients and available tools (exits) |
| `npm run broker-client` | `node hello-world/broker-client.js` | Start a sample broker-client (long-running) |
| `npm run client` | `node hello-world/mcp-client.js` | Run an MCP client against the server (exits) |
| `npm run demo` | `node hello-world/demo.js` | All-in-one demo — server + RC + client (exits) |
| `npm run demo:stepwise` | `node hello-world/demo-stepwise.js` | Step-by-step demo orchestrated in one process (exits) |
| `npm run serve` | `node hello-world/serve.js` | Server + sample RC together (long-running) |
| `npm run serve:chrome` | `node chrome-ext-demo/serve-chrome.js` | Server + auto-announcer for Chrome ext demo (long-running) |
| `npm run auto-announce` | `node chrome-ext-demo/auto-announce.js` | Call `clickAnnounce` every 15s via MCP (long-running) |
| `npm run click` | `node chrome-ext-demo/click-announce.js` | One-shot: list tools + call clickAnnounce (exits) |
| `npm run ollama` | `node ollama/ollama-rc.js` | Ollama broker-client — publishes `generate` tool (long-running) |
| `npm run ai-invoke` | `node ai-invoke/ai-invoke-rc.js` | AI-invoke broker-client — uses `chat()` to generate + eval code (long-running) |
| `npm run ai-caller` | `node ai-invoke/ai-caller.js` | MCP client that calls the `invoke` tool with natural language (exits) |
| `npm run service` | `node simple-service/simple-service.js` | Minimal long-running service with ping, chat, exit tools |
| `npm run speaker` | `node conversation-speaker/conversation-speaker.js` | Multi-persona AI conversation with TTS output |

## Ollama Integration

The Ollama broker-client connects to the MCP broker and publishes a `generate` tool that wraps the local Ollama API. The Chrome extension clock page includes a prompt/response panel that calls this tool through the MCP broker — enabling LLM inference directly from the browser.

### Setup

1. Install and run Ollama: `ollama serve`
2. Pull a model: `ollama pull qwen2.5:3b`
3. Start the MCP server: `npm run dev`
4. Start the Ollama broker-client: `cd examples && npm run ollama`
5. Load the Chrome extension and open the clock page
6. Type a prompt in the **Ollama Inference** panel and hit **Send**

### How It Works

```
Browser (clock.js)           MCP Broker (:3098)        ollama-rc.js            Ollama (:11434)
      │                            │                        │                       │
      │  POST /mcp                 │                        │                       │
      │  tools/call                │                        │                       │
      │  ollama__generate          │                        │                       │
      │ ─────────────────────────► │                        │                       │
      │                            │  WS: tool_call         │                       │
      │                            │ ─────────────────────► │                       │
      │                            │                        │  POST /api/generate   │
      │                            │                        │ ─────────────────────► │
      │                            │                        │                       │
      │                            │                        │  ◄─ JSON response ──  │
      │                            │  ◄── tool_result ────  │                       │
      │  ◄── SSE response ─────── │                        │                       │
      │                            │                        │                       │
```

### Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `qwen2.5:1.5b` | Default model for generate calls |
| `BROKER_WS_URL` | `ws://localhost:3099` | MCP broker WebSocket URL |

## VS Code MCP Configuration

Add to your `.vscode/mcp.json`:

```json
{
  "servers": {
    "mcp-broker": {
      "type": "streamable-http",
      "url": "http://localhost:3098/mcp"
    }
  }
}
```

## Chat Proxy (AI Access for Broker-Clients)

Every connected broker-client has access to AI inference via `rc.chat()`. The request travels through the broker, which proxies to the Ollama MCP server — so broker-clients never need to know about Ollama directly.

### Flow

```
Broker-Client              Broker (:3099)         Ollama MCP (:3042)
      │                            │                             │
      │  WS: chat_request          │                             │
      │  {model, messages}         │                             │
      │ ─────────────────────────► │                             │
      │                            │  MCP tools/call             │
      │                            │  request({prompt, model})   │
      │                            │ ──────────────────────────► │
      │                            │                             │  → Ollama API
      │                            │  ◄── tool result ────────── │
      │  ◄── WS: chat_response ──  │                             │
      │  {message: {role, content}} │                             │
```

### Usage

```javascript
const response = await rc.chat({
  model: 'qwen2.5:3b',
  messages: [
    { role: 'system', content: 'You write JavaScript code.' },
    { role: 'user', content: 'Return code that counts all buttons' },
  ],
});
console.log(response.message.content);
```

### AI-Invoke Example

A broker-client that uses `chat()` to dynamically generate and execute code:

```bash
# Terminal 1: Start Ollama MCP server (port 3042)
# Terminal 2:
npm run dev
# Terminal 3:
cd examples
npm run ai-invoke
# Terminal 4:
cd examples
npm run ai-caller
```

The caller sends natural language instructions, the ai-invoke RC asks the AI to generate code via `chat()`, evals it, and returns the result.

## SDK Usage

```javascript
import { BrokerClient } from './sdk.js';

const rc = new BrokerClient('my-agent', { url: 'ws://localhost:3099' });

rc.addTool({
  name: 'screenshot',
  description: 'Take a screenshot of the current page',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => {
    // Your implementation here
    return 'screenshot taken';
  },
});

await rc.connect();

// Chat is available immediately after connect
const response = await rc.chat({
  model: 'qwen2.5:3b',
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(response.message.content);
```

## Tool Namespacing

Tools are automatically namespaced by client ID to prevent collisions:

| Broker-Client ID | Tool Name | MCP Tool Name |
|---|---|---|
| `browser1` | `screenshot` | `browser1__screenshot` |
| `game1` | `getState` | `game1__getState` |

## Built-in Tools

| Tool | Description |
|---|---|
| `list_broker_clients` | Lists all connected broker-clients and their tools |

## Protocol

WebSocket messages between server and broker-clients:

| Direction | Type | Fields |
|---|---|---|
| client → server | `register` | `clientId`, `tools` |
| server → client | `registered` | `clientId` |
| client → server | `unregister` | — |
| server → client | `tool_call` | `callId`, `tool`, `arguments` |
| client → server | `tool_result` | `callId`, `content`, `isError` |
| client → server | `chat_request` | `requestId`, `payload` (Ollama chat format) |
| server → client | `chat_response` | `requestId`, `payload` (Ollama chat response) |
| server → client | `chat_error` | `requestId`, `error` |

## Dashboard

The broker includes a built-in web dashboard at `http://localhost:3098/` with:

- **Stats bar** — Uptime, connected clients, total tools, call/chat counts
- **Tool Explorer** — Hierarchical client → tool tree with expand/collapse
- **Interactive Tool Panel** — Select any tool to see an auto-generated form from its `inputSchema`, fill in parameters, and click **Run Tool** to invoke it via `POST /api/call-tool`
- **Activity Log** — Real-time SSE feed of connections, tool calls, and chat requests
- **Live indicator** — SSE connection status (green = connected)

### Dashboard API

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Dashboard HTML |
| `/api/status` | GET | Server status snapshot (clients, tools, stats) |
| `/api/activity` | GET | Recent activity entries |
| `/api/events` | GET | SSE stream (state + activity events) |
| `/api/call-tool` | POST | Invoke a tool: `{ clientId, tool, arguments }` → `{ content, isError, duration }` |

## Docker

Run the broker as a container:

```bash
# Build and run with docker-compose
docker compose up -d

# Or build manually
docker build -t mcp-broker .
docker run -p 3098:3098 -p 3099:3099 mcp-broker
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `BROKER_WS_PORT` | `3099` | WebSocket port for broker-clients |
| `MCP_HTTP_PORT` | `3098` | HTTP port for MCP clients |
| `OLLAMA_MCP_URL` | `http://localhost:3042/mcp` | Ollama MCP server URL for chat proxy |
