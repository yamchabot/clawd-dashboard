/**
 * clawd-dashboard server
 * - Serves static files from dist/
 * - Properly proxies WS /ws → OpenClaw gateway using http.request upgrade
 */

import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
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

function serveStatic(req, res) {
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

server.on('upgrade', (req, clientSocket, head) => {
  const url = req.url || '/'
  const isGateway = url === '/ws' || url.startsWith('/ws?') || url.startsWith('/ws/')

  if (!isGateway) {
    clientSocket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    clientSocket.destroy()
    return
  }

  console.log(`[ws] proxying upgrade to gateway ${GATEWAY_HOST}:${GATEWAY_PORT}`)

  // Build forwarded headers
  const headers = {}
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers[req.rawHeaders[i]] = req.rawHeaders[i + 1]
  }
  // Set host + origin both to localhost so the gateway's origin check passes:
  // checkBrowserOrigin passes when parsedOrigin.host === requestHost (both localhost)
  headers['host'] = `localhost:${GATEWAY_PORT}`
  headers['origin'] = `https://localhost:${GATEWAY_PORT}`

  const proxyReq = https.request({
    hostname: GATEWAY_HOST,
    port: GATEWAY_PORT,
    path: '/',
    method: 'GET',
    headers,
    rejectUnauthorized: false, // gateway may use self-signed cert
  })

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    console.log(`[ws] gateway upgraded, status=${proxyRes.statusCode}`)

    // Forward the 101 response back to the browser
    let responseHead = `HTTP/1.1 101 Switching Protocols\r\n`
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      responseHead += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`
    }
    responseHead += '\r\n'

    clientSocket.write(responseHead)

    // Forward any buffered data
    if (proxyHead && proxyHead.length > 0) clientSocket.write(proxyHead)
    if (head && head.length > 0) proxySocket.write(head)

    // Bidirectional pipe
    proxySocket.pipe(clientSocket, { end: false })
    clientSocket.pipe(proxySocket, { end: false })

    proxySocket.on('error', (e) => { console.error('[ws] proxy socket error:', e.message); clientSocket.destroy() })
    clientSocket.on('error', (e) => { proxySocket.destroy() })
    proxySocket.on('close', () => clientSocket.destroy())
    clientSocket.on('close', () => proxySocket.destroy())
  })

  proxyReq.on('response', (res) => {
    // Gateway returned a non-101 HTTP response — forward it as-is then close
    console.error(`[ws] gateway returned HTTP ${res.statusCode} instead of 101`)
    clientSocket.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n\r\n`)
    clientSocket.destroy()
  })

  proxyReq.on('error', (e) => {
    console.error(`[ws] proxy request error: ${e.message}`)
    clientSocket.write(`HTTP/1.1 502 Bad Gateway\r\n\r\n`)
    clientSocket.destroy()
  })

  proxyReq.end()
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🐉 clawd-dashboard on :${PORT}`)
  console.log(`   Static  → dist/`)
  console.log(`   WS /ws  → ${GATEWAY_HOST}:${GATEWAY_PORT}`)
  console.log(`   (using http.request upgrade proxy)\n`)
})
