/**
 * clawd-dashboard server
 * - Serves static files from dist/
 * - Proxies WS /ws → OpenClaw gateway
 * - REST API:
 *     GET  /api/widgets          → read widgets.json
 *     PUT  /api/widgets          → overwrite widgets.json
 *     GET  /api/widgets/events   → SSE stream, fires on file change
 *     POST /api/exec             → run a shell command, return {stdout,stderr,exitCode}
 */

import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const WIDGETS_FILE = path.join(__dirname, 'widgets.json')
const PORT = 5174
const GATEWAY_HOST = process.env.GATEWAY_HOST || 'host.docker.internal'
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '18789')

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf',
}

// ── SSE clients ───────────────────────────────────────────────────────────────
const sseClients = new Set()

function broadcastWidgetsChanged() {
  const msg = `data: ${JSON.stringify({ type: 'widgets-changed', ts: Date.now() })}\n\n`
  for (const res of sseClients) {
    try { res.write(msg) } catch { sseClients.delete(res) }
  }
}

// Watch widgets.json for changes (e.g. the AI writes to it directly)
let watchDebounce = null
function setupFileWatch() {
  try {
    fs.watch(WIDGETS_FILE, () => {
      clearTimeout(watchDebounce)
      watchDebounce = setTimeout(broadcastWidgetsChanged, 100)
    })
  } catch (e) {
    console.warn('[widgets] fs.watch failed, polling will be used by client:', e.message)
  }
}
setupFileWatch()

// ── Widget file helpers ───────────────────────────────────────────────────────
function readWidgets() {
  try {
    return JSON.parse(fs.readFileSync(WIDGETS_FILE, 'utf8'))
  } catch {
    return { version: 1, widgets: [] }
  }
}

function writeWidgets(data) {
  fs.writeFileSync(WIDGETS_FILE, JSON.stringify(data, null, 2))
  broadcastWidgetsChanged()
}

// ── API handlers ──────────────────────────────────────────────────────────────
function handleApi(req, res) {
  const { url, method } = req

  // CORS (same origin but be safe for dev)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // GET /api/widgets
  if (url === '/api/widgets' && method === 'GET') {
    const data = readWidgets()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
    return
  }

  // PUT /api/widgets — replace entire widgets.json
  if (url === '/api/widgets' && method === 'PUT') {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        writeWidgets(data)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // GET /api/widgets/events — SSE stream
  if (url === '/api/widgets/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    return
  }

  // POST /api/exec — run a shell command
  if (url === '/api/exec' && method === 'POST') {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => {
      try {
        const { cmd, timeout = 15000, cwd } = JSON.parse(body)
        if (!cmd || typeof cmd !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'cmd required' }))
          return
        }
        execFile('sh', ['-c', cmd], { timeout, cwd: cwd || process.cwd(), maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: err?.code ?? 0,
          }))
        })
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
}

// ── Static file handler ───────────────────────────────────────────────────────
function serveStatic(req, res) {
  // API routes
  if (req.url.startsWith('/api/')) {
    handleApi(req, res)
    return
  }

  let filePath = path.join(DIST, req.url.split('?')[0])
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html')
  }
  const ext = path.extname(filePath)
  try {
    const data = fs.readFileSync(filePath)
    const isHtml = ext === '.html' || !ext
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isHtml ? 'no-store, no-cache, must-revalidate' : 'public, max-age=31536000, immutable',
      'Pragma': isHtml ? 'no-cache' : '',
    })
    res.end(data)
  } catch {
    res.writeHead(404); res.end('Not found')
  }
}

const server = http.createServer(serveStatic)

// ── WebSocket proxy ───────────────────────────────────────────────────────────
server.on('upgrade', (req, clientSocket, head) => {
  const url = req.url || '/'
  const isGateway = url === '/ws' || url.startsWith('/ws?') || url.startsWith('/ws/')

  if (!isGateway) {
    clientSocket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    clientSocket.destroy()
    return
  }

  console.log(`[ws] proxying upgrade to gateway ${GATEWAY_HOST}:${GATEWAY_PORT}`)

  const headers = {}
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers[req.rawHeaders[i]] = req.rawHeaders[i + 1]
  }
  headers['host'] = `localhost:${GATEWAY_PORT}`
  headers['origin'] = `https://localhost:${GATEWAY_PORT}`

  const proxyReq = https.request({
    hostname: GATEWAY_HOST,
    port: GATEWAY_PORT,
    path: '/',
    method: 'GET',
    headers,
    rejectUnauthorized: false,
  })

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    let responseHead = `HTTP/1.1 101 Switching Protocols\r\n`
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      responseHead += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`
    }
    responseHead += '\r\n'
    clientSocket.write(responseHead)
    if (proxyHead && proxyHead.length > 0) clientSocket.write(proxyHead)
    if (head && head.length > 0) proxySocket.write(head)
    proxySocket.pipe(clientSocket, { end: false })
    clientSocket.pipe(proxySocket, { end: false })
    proxySocket.on('error', () => clientSocket.destroy())
    clientSocket.on('error', () => proxySocket.destroy())
    proxySocket.on('close', () => clientSocket.destroy())
    clientSocket.on('close', () => proxySocket.destroy())
  })

  proxyReq.on('response', (res) => {
    console.error(`[ws] gateway returned HTTP ${res.statusCode}`)
    clientSocket.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n\r\n`)
    clientSocket.destroy()
  })

  proxyReq.on('error', (e) => {
    console.error(`[ws] proxy error: ${e.message}`)
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    clientSocket.destroy()
  })

  proxyReq.end()
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🐉 clawd-dashboard on :${PORT}`)
  console.log(`   Static  → dist/`)
  console.log(`   WS /ws  → ${GATEWAY_HOST}:${GATEWAY_PORT}`)
  console.log(`   API     → /api/widgets, /api/exec\n`)
})
