/**
 * API integration tests for server.mjs.
 *
 * Spawns the server on an isolated port with a temp widgets.json file,
 * exercises every endpoint, and verifies the server stays alive under
 * conditions that previously caused it to crash (e.g. large PUT payloads,
 * repeated writes, SSE connections that drop).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_PATH = join(__dirname, '..', 'server.mjs')
const TEST_PORT = 15_199

let serverProcess: ChildProcess
let tmpDir: string
let widgetsFile: string

const BASE = `http://localhost:${TEST_PORT}`

// ── Helpers ─────────────────────────────────────────────────────────────────

async function waitForServer(maxMs = 8000): Promise<void> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/widgets`)
      if (r.ok) return
    } catch {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  throw new Error(`Server on :${TEST_PORT} did not become ready in ${maxMs}ms`)
}

// Minimal valid widget object
function makeWidget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-widget-1',
    title: 'Test Widget',
    description: 'A test widget',
    code: "function Widget() { return React.createElement('div', null, 'hi'); }",
    size: 'md',
    enabled: true,
    order: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

async function putWidgets(widgets: unknown[]) {
  return fetch(`${BASE}/api/widgets`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, widgets }),
  })
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  tmpDir = join(tmpdir(), `clawd-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  widgetsFile = join(tmpDir, 'widgets.json')
  writeFileSync(widgetsFile, JSON.stringify({ version: 1, widgets: [] }))

  serverProcess = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      WIDGETS_FILE: widgetsFile,
    },
    cwd: join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  serverProcess.stderr?.on('data', (d: Buffer) => {
    process.stderr.write(`[server stderr] ${d}`)
  })

  await waitForServer()
})

afterAll(() => {
  serverProcess?.kill('SIGTERM')
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/widgets', () => {
  it('returns 200 with a valid widgets envelope', async () => {
    const res = await fetch(`${BASE}/api/widgets`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('widgets')
    expect(Array.isArray(body.widgets)).toBe(true)
  })
})

describe('PUT /api/widgets', () => {
  it('accepts a valid widget array and persists it', async () => {
    const widget = makeWidget()
    const res = await putWidgets([widget])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    // Verify it was actually written to disk
    const fileContent = JSON.parse(readFileSync(widgetsFile, 'utf8'))
    expect(fileContent.widgets).toHaveLength(1)
    expect(fileContent.widgets[0].title).toBe('Test Widget')
  })

  it('round-trips correctly — GET returns what was PUT', async () => {
    const widget = makeWidget({ title: 'Round Trip Test', id: 'rt-test' })
    await putWidgets([widget])

    const res = await fetch(`${BASE}/api/widgets`)
    const body = await res.json()
    const found = body.widgets.find((w: { id: string }) => w.id === 'rt-test')
    expect(found).toBeDefined()
    expect(found?.title).toBe('Round Trip Test')
  })

  it('returns 400 for malformed JSON body', async () => {
    const res = await fetch(`${BASE}/api/widgets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'this is not json {{{',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('handles a large payload (realistic preset widget sizes) without crashing', async () => {
    // Simulates adding a preset with a long code string (~3KB of JS code)
    const longCode = [
      "function Widget() {",
      "  const [data, setData] = React.useState(null);",
      "  const [err, setErr] = React.useState(null);",
      "  const load = () => {",
      "    setErr(null);",
      "    fetch('https://wttr.in/?format=j1')",
      "      .then(r => r.json())",
      "      .then(j => {",
      "        const c = j.current_condition[0];",
      "        setData({ temp: c.temp_F + '\\u00b0F', desc: c.weatherDesc[0].value });",
      "      })",
      "      .catch(() => setErr('Failed to load weather'));",
      "  };",
      "  useEffect(() => { load(); }, []);",
      "  if (err) return React.createElement('div', { style: { color: 'var(--red)', padding: '8px' } }, err);",
      "  if (!data) return React.createElement('div', { style: { padding: '8px', color: 'var(--text-muted)' } }, 'Loading...');",
      "  return React.createElement('div', { style: { padding: '4px 0' } },",
      "    React.createElement('div', { style: { fontSize: '28px', fontWeight: 700 } }, data.temp),",
      "    React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, data.desc)",
      "  );",
      "}",
    ].join('\n')

    // Build a realistic payload of ~8 widgets to stress the PUT handler
    const widgets = Array.from({ length: 8 }, (_, i) =>
      makeWidget({ id: `stress-${i}`, title: `Widget ${i}`, code: longCode, order: i }),
    )

    const res = await putWidgets(widgets)
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    // Server must still be responsive after the large write
    const check = await fetch(`${BASE}/api/widgets`)
    expect(check.status).toBe(200)
  })

  it('handles multiple rapid PUTs without crashing', async () => {
    // Fire 10 PUTs in parallel — previously this could crash via SSE broadcast race
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        putWidgets([makeWidget({ id: `rapid-${i}`, title: `Rapid ${i}`, order: i })]),
      ),
    )
    expect(results.every(r => r.status === 200)).toBe(true)

    // Server must still be responsive
    const check = await fetch(`${BASE}/api/widgets`)
    expect(check.status).toBe(200)
  })
})

describe('POST /api/exec', () => {
  it('runs a simple shell command and returns stdout', async () => {
    const res = await fetch(`${BASE}/api/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'echo hello-clawd' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stdout.trim()).toBe('hello-clawd')
    expect(body.exitCode).toBe(0)
  })

  it('captures stderr separately', async () => {
    const res = await fetch(`${BASE}/api/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'echo err >&2; echo out' }),
    })
    const body = await res.json()
    expect(body.stdout.trim()).toBe('out')
    expect(body.stderr.trim()).toBe('err')
  })

  it('returns non-zero exitCode for failing commands', async () => {
    const res = await fetch(`${BASE}/api/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'exit 42' }),
    })
    const body = await res.json()
    expect(body.exitCode).not.toBe(0)
  })

  it('returns 400 if cmd is missing', async () => {
    const res = await fetch(`${BASE}/api/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notCmd: 'oops' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('Static files', () => {
  it('returns 200 for index.html', async () => {
    const res = await fetch(BASE + '/')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.toLowerCase()).toContain('<!doctype html>')
  })
})

describe('Unknown routes', () => {
  it('returns 404 for unknown API routes', async () => {
    const res = await fetch(`${BASE}/api/doesnotexist`)
    expect(res.status).toBe(404)
  })
})

describe('SSE resilience', () => {
  it('server survives a client connecting and immediately disconnecting from /api/widgets/events', async () => {
    // Open SSE connection and immediately destroy it — previously could crash the server
    // via an unhandled error event when broadcastWidgetsChanged tried to write to dead socket
    const ctrl = new AbortController()
    const fetchPromise = fetch(`${BASE}/api/widgets/events`, { signal: ctrl.signal }).catch(() => {})
    ctrl.abort()
    await fetchPromise

    // Now trigger a broadcast by doing a PUT
    const res = await putWidgets([makeWidget({ id: 'sse-test', title: 'SSE Test' })])
    expect(res.status).toBe(200)

    // Server must be alive
    const check = await fetch(`${BASE}/api/widgets`)
    expect(check.status).toBe(200)
  })
})
