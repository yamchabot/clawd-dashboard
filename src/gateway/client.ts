import { getOrCreateDeviceIdentity, buildDeviceAuth } from './crypto'
import type { ChatEvent, Session } from './types'

type MessageHandler = (frame: Record<string, unknown>) => void
type EventHandler = (event: Record<string, unknown>) => void

export interface GatewayClientOptions {
  url: string
  token?: string
  onStateChange: (state: ClientState) => void
  onChat: (event: ChatEvent['payload']) => void
  onSessions: (sessions: Session[]) => void
  onDisconnect: (reason: string) => void
  onDevicePairingRequired: () => void
}

export type ClientState = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error'

export class GatewayClient {
  private ws: WebSocket | null = null
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private options: GatewayClientOptions
  private state: ClientState = 'disconnected'
  private reconnectTimer: number | null = null
  private challenge: { nonce: string; ts: number } | null = null
  private _deviceToken: string | null = null
  private connected = false
  private reqSeq = 0

  constructor(options: GatewayClientOptions) {
    this.options = options
  }

  get deviceToken() { return this._deviceToken }

  private setState(s: ClientState) {
    this.state = s
    this.options.onStateChange(s)
  }

  connect() {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.setState('connecting')
    this.connected = false

    try {
      this.ws = new WebSocket(this.options.url)
    } catch (e) {
      this.setState('error')
      this.options.onDisconnect(String(e))
      return
    }

    this.ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data as string) as Record<string, unknown>
        this.handleFrame(frame)
      } catch (e) {
        console.error('[gateway] parse error', e)
      }
    }

    this.ws.onerror = () => {
      this.setState('error')
    }

    this.ws.onclose = (ev) => {
      this.connected = false
      const reason = ev.reason || `code ${ev.code}`
      this.setState('disconnected')
      this.options.onDisconnect(reason)
      // Reject all pending requests
      for (const [, { reject }] of this.pendingRequests) {
        reject(new Error('disconnected'))
      }
      this.pendingRequests.clear()
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.ws) {
      // Null ALL handlers before closing so in-flight messages are silently dropped
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.connected = false
    this.setState('disconnected')
  }

  private handleFrame(frame: Record<string, unknown>) {
    if (frame.type === 'event') {
      this.handleEvent(frame as Record<string, unknown> & { event: string; payload?: unknown })
    } else if (frame.type === 'res') {
      const id = frame.id as string
      const pending = this.pendingRequests.get(id)
      if (pending) {
        this.pendingRequests.delete(id)
        if (frame.ok) {
          pending.resolve(frame.payload)
        } else {
          pending.reject(frame.error)
        }
      }
    }
  }

  private async handleEvent(frame: { event: string; payload?: unknown }) {
    const { event, payload } = frame

    if (event === 'connect.challenge') {
      this.challenge = payload as { nonce: string; ts: number }
      this.setState('authenticating')
      await this.doHandshake()
      return
    }

    if (event === 'chat') {
      this.options.onChat(payload as ChatEvent['payload'])
    }

    // Dispatch to registered handlers
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      for (const h of handlers) h(payload as Record<string, unknown>)
    }
  }

  private async doHandshake() {
    if (!this.challenge) return

    const identity = await getOrCreateDeviceIdentity()
    const storedToken = localStorage.getItem(`clawd-device-token:${identity.id}`)
    const authToken = storedToken || this.options.token || undefined

    const SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing']

    let devicePayload: Record<string, unknown> | undefined
    try {
      const auth = await buildDeviceAuth({
        identity,
        connectNonce: this.challenge.nonce,
        clientId: 'openclaw-control-ui',
        clientMode: 'webchat',
        role: 'operator',
        scopes: SCOPES,
        token: authToken,
      })
      devicePayload = auth
    } catch (e) {
      console.warn('[gateway] crypto signing failed, trying without device identity:', e)
    }

    const connectParams: Record<string, unknown> = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'openclaw-control-ui',
        version: '0.1.0',
        platform: navigator.platform || 'web',
        mode: 'webchat',
      },
      role: 'operator',
      scopes: SCOPES,
      locale: navigator.language,
      userAgent: navigator.userAgent,
      caps: [],
    }

    if (devicePayload) connectParams.device = devicePayload
    // Always send auth block — gateway expects it even if token is empty
    connectParams.auth = { token: authToken || '' }

    try {
      const result = await this.request<{
        type: string
        protocol: number
        auth?: { deviceToken: string; role: string; scopes: string[] }
        snapshot?: unknown
        server?: { version: string; connId: string }
      }>('connect', connectParams)

      if (result.auth?.deviceToken) {
        this._deviceToken = result.auth.deviceToken
        localStorage.setItem(`clawd-device-token:${identity.id}`, result.auth.deviceToken)
      }

      this.connected = true
      this.setState('connected')
      // Load sessions after connect
      this.loadSessions()
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string } | null
      const msg = err?.message || String(e)
      if (msg.includes('pairing') || msg.includes('device identity') || msg.includes('device_identity') || msg.includes('unpaired') || msg.includes('not approved')) {
        this.options.onDevicePairingRequired()
      }
      this.setState('error')
      this.options.onDisconnect(msg)
    }
  }

  private send(frame: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame))
    }
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = `req-${++this.reqSeq}-${Date.now()}`
    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.send({ type: 'req', id, method, params })
    })
  }

  on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, new Set())
    this.eventHandlers.get(event)!.add(handler)
    return () => this.eventHandlers.get(event)?.delete(handler)
  }

  // ─── Chat API ───────────────────────────────────────────────────────────────

  async sendMessage(sessionKey: string, message: string, idempotencyKey: string) {
    return this.request('chat.send', {
      sessionKey,
      message,
      idempotencyKey,
    })
  }

  async loadHistory(sessionKey: string, limit = 100) {
    return this.request<{ messages: unknown[] }>('chat.history', { sessionKey, limit })
  }

  async abortRun(sessionKey: string, runId?: string) {
    return this.request('chat.abort', { sessionKey, ...(runId ? { runId } : {}) })
  }

  // ─── Sessions API ────────────────────────────────────────────────────────────

  async loadSessions() {
    try {
      const result = await this.request('sessions.list', {
        limit: 50,
        includeDerivedTitles: true,
        includeLastMessage: true,
      })
      // Result may be an array directly or { sessions: [...] }
      const raw = result as unknown
      let sessions: Session[] = []
      if (Array.isArray(raw)) {
        sessions = raw as Session[]
      } else if (raw && typeof raw === 'object' && 'sessions' in raw) {
        sessions = (raw as { sessions: Session[] }).sessions ?? []
      }
      this.options.onSessions(sessions)
    } catch (e) {
      console.warn('[gateway] sessions.list failed', e)
    }
  }

  async deleteSession(key: string) {
    return this.request('sessions.delete', { key })
  }

  async resetSession(key: string) {
    return this.request('sessions.reset', { key, reason: 'reset' })
  }

  // ─── System info (via exec or agent request) ─────────────────────────────────
  isConnected() { return this.connected && this.state === 'connected' }
}
