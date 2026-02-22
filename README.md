# Clawd Dashboard 🐉

A hip, sexy React dashboard for OpenClaw. Multi-session chat + AI-powered widget system.

## Features

- **Multi-session management** — horizontal tab bar, create/switch/delete sessions
- **Chat panel** — streaming responses, markdown rendering, abort button
- **Widget system** — ask the agent to create dashboard widgets that live on the left panel
- **Widget refresh** — each widget has a 🔄 button that asks the agent to rewrite it
- **Error recovery** — widget errors show an "Ask agent to fix" button
- **Device crypto** — proper Ed25519 device identity for gateway auth
- **Auto-reconnect** — connects on load, status indicator in top bar

## Setup

```bash
cd ~/.openclaw/workspace/clawd-dashboard
npm install
npm run dev
```

Then open **http://localhost:5174**

## Gateway config

The dashboard connects to `ws://127.0.0.1:18789` by default (OpenClaw gateway default).

Click ⚙️ in the top bar to change the URL or enter a token.

### If you get a pairing error

Local connections (127.0.0.1) are auto-approved. For remote connections:

```bash
openclaw devices list
openclaw devices approve <requestId>
```

Or for break-glass (local dev only), add to `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "controlUi": {
      "dangerouslyDisableDeviceAuth": true,
      "allowedOrigins": ["http://localhost:5174"]
    }
  }
}
```

## Creating widgets via chat

Ask the agent something like:

> "Create a widget that shows a live clock"

The agent should respond with a `widget` code block:

````
```widget
{"title": "Clock", "code": "function Widget() { ... }"}
```
````

The dashboard auto-detects this format and renders the widget on the left panel.

### Widget API available in code

- React, useState, useEffect, useMemo, useCallback, useRef
- fetch, console
- CSS variables: `var(--text-primary)`, `var(--bg-surface)`, `var(--accent)`, etc.

### Example widget (plain createElement, no JSX transpiler)

```javascript
function Widget() {
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);
  return React.createElement('div', {
    style: { fontFamily: 'var(--mono)', fontSize: '24px', color: 'var(--accent-bright)', textAlign: 'center', padding: '8px' }
  }, time);
}
```

> **Note:** Widget code runs through `new Function(...)` — no JSX transpilation.
> Use `React.createElement(...)` or tell the agent to output plain createElement calls.

## Sandbox info widgets

Ask the agent:
- "Show me running processes in the sandbox"
- "What ports are listening in my container?"
- "Tail the gateway logs"

The agent can exec commands in the sandbox and format the output as a widget.

## Project structure

```
src/
  gateway/
    client.ts      # WebSocket client (connect, chat, sessions)
    crypto.ts      # Ed25519 device identity + challenge signing
    types.ts       # Protocol types
  store/
    gateway.ts     # Zustand store (connection state, chat, sessions)
    widgets.ts     # Widget registry (persisted to localStorage)
  components/
    SessionBar.tsx    # Top bar with session tabs
    ChatPanel.tsx     # Main chat interface
    WidgetPanel.tsx   # Left panel widget grid
    WidgetRunner.tsx  # Dynamic widget execution + error boundary
    ConnectModal.tsx  # Gateway connection dialog
```
