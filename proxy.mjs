/**
 * Standalone proxy server for clawd-dashboard.
 * Runs on port 5175 and handles:
 *   - WebSocket /ws  → ws://host.docker.internal:18789  (OpenClaw gateway)
 *   - WebSocket /*   → ws://localhost:5174              (Vite HMR)
 *   - HTTP /*        → http://localhost:5174            (Vite app)
 *
 * Point cloudflared at port 5175 instead of 5174.
 */

import http from 'http'
import net from 'net'
import { createServer } from 'http'

const VITE_PORT = 5174
const PROXY_PORT = 5175
const GATEWAY_HOST = 'host.docker.internal'
const GATEWAY_PORT = 18789

// Headers that must not be forwarded between hops (RFC 7230)
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate',
])

function proxyHttp(req, res, targetPort) {
  // Strip hop-by-hop headers before forwarding — Cloudflare often injects
  // transfer-encoding: chunked which confuses Node's HTTP client.
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v
  }
  headers['host'] = `localhost:${targetPort}`

  const options = {
    hostname: 'localhost',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers,
  }
  const proxy = http.request(options, (proxyRes) => {
    // Strip hop-by-hop from response too
    const respHeaders = {}
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) respHeaders[k] = v
    }
    res.writeHead(proxyRes.statusCode, respHeaders)
    proxyRes.pipe(res, { end: true })
    proxyRes.on('error', () => res.destroy())
  })
  proxy.on('error', (e) => {
    if (!res.headersSent) { res.writeHead(502); res.end(`Proxy error: ${e.message}`) }
    else res.destroy()
  })
  req.on('error', () => proxy.destroy())
  req.pipe(proxy, { end: true })
}

function tunnelWs(clientSocket, targetHost, targetPort, reqHeaders) {
  const target = net.connect(targetPort, targetHost, () => {
    // Forward the upgrade request
    const reqLine = `GET / HTTP/1.1\r\n`
    const headers = Object.entries({
      ...reqHeaders,
      host: `${targetHost}:${targetPort}`,
    })
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n')

    target.write(`${reqLine}${headers}\r\n\r\n`)
  })

  target.on('error', (e) => {
    console.error('[proxy] WS target error:', e.message)
    clientSocket.destroy()
  })

  clientSocket.pipe(target)
  target.pipe(clientSocket)

  clientSocket.on('error', () => target.destroy())
  target.on('close', () => clientSocket.destroy())
  clientSocket.on('close', () => target.destroy())
}

// Better approach: raw TCP tunnel preserving full HTTP upgrade
function rawTcpTunnel(clientSocket, targetHost, targetPort, headData) {
  const target = net.connect(targetPort, targetHost, () => {
    target.write(headData)
  })

  target.on('error', (e) => {
    console.error(`[proxy] TCP tunnel error ${targetHost}:${targetPort}:`, e.message)
    clientSocket.end()
  })

  clientSocket.pipe(target)
  target.pipe(clientSocket)
  clientSocket.on('error', () => target.destroy())
  target.on('close', () => clientSocket.end())
  clientSocket.on('close', () => target.destroy())
}

// ── Global crash guards ───────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[proxy] Uncaught exception (kept alive):', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[proxy] Unhandled rejection (kept alive):', reason)
})

const server = createServer((req, res) => {
  proxyHttp(req, res, VITE_PORT)
})

server.on('upgrade', (req, socket, head) => {
  const isGateway = req.url === '/ws' || req.url?.startsWith('/ws?') || req.url?.startsWith('/ws/')
  const buf = Buffer.concat([Buffer.from(
    `GET ${isGateway ? '/' : req.url} HTTP/1.1\r\n` +
    Object.entries({ ...req.headers, host: isGateway ? `${GATEWAY_HOST}:${GATEWAY_PORT}` : `localhost:${VITE_PORT}` })
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n') +
    '\r\n\r\n'
  ), head])

  if (isGateway) {
    console.log(`[proxy] WS upgrade → gateway ${GATEWAY_HOST}:${GATEWAY_PORT}`)
    rawTcpTunnel(socket, GATEWAY_HOST, GATEWAY_PORT, buf)
  } else {
    console.log(`[proxy] WS upgrade → Vite HMR`)
    rawTcpTunnel(socket, 'localhost', VITE_PORT, buf)
  }
})

server.on('error', (err) => console.error('[proxy] HTTP server error:', err.message))

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`\n🐉 Clawd proxy running on port ${PROXY_PORT}`)
  console.log(`   HTTP  /* → localhost:${VITE_PORT} (Vite)`)
  console.log(`   WS  /ws  → ${GATEWAY_HOST}:${GATEWAY_PORT} (OpenClaw gateway)`)
  console.log(`   WS   /*  → localhost:${VITE_PORT} (Vite HMR)\n`)
})
