# Chrome Extension Demo

A Chrome MV3 extension that injects broker-clients into web pages. The demo uses a clock page to show two scenarios: triggering page actions via MCP tools, and iterative AI property resolution.

## Files

| File | Description |
|------|-------------|
| `clock.html` | Demo page with a live clock, announce button, and tabbed UI (Clock / Properties) |
| `clock.js` | Page logic — tab switching, announce button, conversation log rendering |
| `inject.js` | Browser-injectable broker-client that publishes `clickAnnounce` |
| `property-rc.js` | Browser-injectable broker-client that publishes `addProperty`, `getProperty`, `listProperties` |
| `mcp-browser-client.js` | Lightweight MCP client for the browser (used by clock.js for kokoro-tts) |
| `manifest.json` | Chrome MV3 extension manifest |
| `popup.html` | Extension popup UI |
| `popup.js` | Extension popup logic |
| `background.js` | Extension service worker |
| `auto-announce.js` | Node.js MCP client that calls `clickAnnounce` every 15 seconds |
| `click-announce.js` | Node.js one-shot MCP client — calls `clickAnnounce` once and exits |
| `serve-chrome.js` | Orchestrator — starts the broker + auto-announcer in one command |

## Quick Start

### 1. Start the server

```bash
npm run serve:chrome
```

This starts the broker and the auto-announcer together.

### 2. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this `chrome-ext-demo/` folder
4. Open `clock.html` in a new tab

### 3. Observe

The auto-announcer calls `clickAnnounce` every 15 seconds, which triggers the clock page to speak the current time via kokoro-tts.

## npm Scripts

| Script | Command |
|--------|---------|
| `npm run serve:chrome` | Starts broker + auto-announcer |
| `npm run auto-announce` | Runs just the auto-announcer |
| `npm run click` | One-shot clickAnnounce call |

## Architecture

```
┌─────────────────┐  HTTP   ┌─────────────┐  WebSocket   ┌────────────────────┐
│  auto-announce   │ ◄─────► │   broker    │ ◄──────────► │  inject.js (page)  │
│  (MCP client)   │         │  :3098/:3099 │              │  clickAnnounce     │
└─────────────────┘         │              │              └────────────────────┘
                            │              │  WebSocket   ┌────────────────────┐
                            │              │ ◄──────────► │  property-rc (page)│
                            │              │              │  addProperty, etc. │
                            └──────────────┘              └────────────────────┘
```

## Tabs

### Clock Tab
- Live clock display
- **Announce** button — speaks the current time via kokoro-tts
- RC connection status indicator

### Properties Tab
- Iterative AI property resolution
- Conversation log showing the AI's multi-step reasoning
- Properties are stored in `window.__properties` and can be read by name

## What It Demonstrates

1. **Browser-injected broker-clients** — JavaScript running in a web page publishes MCP tools
2. **Remote page control** — external Node.js clients can trigger UI actions on the page
3. **Iterative AI workflows** — the property RC uses multi-turn `rc.chat()` conversations to gather context before generating code
4. **Two independent RCs on one page** — `clock-page` and `property-agent` coexist
