import { create } from 'zustand'
import { GatewayClient, type ClientState } from '../gateway/client'
import { getOrCreateDeviceIdentity } from '../gateway/crypto'
import type { ChatMessage, Session, ToolCall } from '../gateway/types'
import { v4 as uuidv4 } from 'uuid'

interface SessionChat {
  messages: ChatMessage[]
  streaming: boolean
  streamingRunId: string | null
}

interface GatewayStore {
  // Connection
  client: GatewayClient | null
  clientState: ClientState
  gatewayUrl: string
  token: string
  error: string | null
  pairingRequired: boolean
  deviceId: string | null

  // Sessions
  sessions: Session[]
  activeSessionKey: string
  sessionChats: Record<string, SessionChat>

  // Actions
  setGatewayConfig: (url: string, token: string) => void
  connect: () => void
  disconnect: () => void
  setActiveSession: (key: string) => void
  createNewSession: () => void
  deleteSession: (key: string) => void
  sendMessage: (text: string) => Promise<void>
  abortStream: () => void
  loadHistory: (key: string) => void
  dismissPairing: () => void
}

function detectDefaultUrl(): string {
  const stored = localStorage.getItem('clawd-gateway-url')
  if (stored) return stored
  // If served over HTTPS or a non-localhost origin, route WS through the Vite proxy
  if (window.location.protocol === 'https:' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
  }
  return 'ws://127.0.0.1:18789'
}

const DEFAULT_URL = detectDefaultUrl()
const DEFAULT_TOKEN = localStorage.getItem('clawd-gateway-token') || ''

function getChat(state: GatewayStore, key: string): SessionChat {
  return state.sessionChats[key] ?? { messages: [], streaming: false, streamingRunId: null }
}

export const useGatewayStore = create<GatewayStore>((set, get) => ({
  client: null,
  clientState: 'disconnected',
  gatewayUrl: DEFAULT_URL,
  token: DEFAULT_TOKEN,
  error: null,
  pairingRequired: false,
  deviceId: null,
  sessions: [],
  activeSessionKey: localStorage.getItem('clawd-active-session') || `main-${Date.now()}`,
  sessionChats: {},

  setGatewayConfig: (url, token) => {
    localStorage.setItem('clawd-gateway-url', url)
    localStorage.setItem('clawd-gateway-token', token)
    set({ gatewayUrl: url, token })
  },

  connect: () => {
    const { gatewayUrl, token, client: oldClient } = get()
    if (oldClient) oldClient.disconnect()

    // Resolve device identity so we can show the ID if pairing is required
    getOrCreateDeviceIdentity().then((identity) => {
      set({ deviceId: identity.id })
    }).catch(() => {
      set({ deviceId: null })
    })

    const client = new GatewayClient({
      url: gatewayUrl,
      token: token || undefined,
      onStateChange: (clientState) => {
        set({ clientState, error: clientState === 'error' ? get().error : null })
      },
      onDisconnect: (reason) => {
        set({ error: reason })
      },
      onDevicePairingRequired: () => {
        set({ pairingRequired: true })
      },
      onChat: (payload) => {
        const { activeSessionKey, sessionChats } = get()
        const key = payload.sessionKey || activeSessionKey

        set((state) => {
          const chat = state.sessionChats[key] ?? { messages: [], streaming: false, streamingRunId: null }

          if (payload.state === 'delta') {
            // Accumulate streaming content
            const content = extractContent(payload.message)
            const msgs = [...chat.messages]
            const last = msgs[msgs.length - 1]

            if (last?.role === 'assistant' && last.runId === payload.runId && last.partial) {
              // Append to existing partial message
              msgs[msgs.length - 1] = { ...last, content: last.content + content }
            } else if (content) {
              msgs.push({
                role: 'assistant',
                content,
                runId: payload.runId,
                partial: true,
                ts: Date.now(),
              })
            }

            return {
              sessionChats: {
                ...state.sessionChats,
                [key]: { messages: msgs, streaming: true, streamingRunId: payload.runId },
              },
            }
          }

          if (payload.state === 'final') {
            const msgs = [...chat.messages]
            const lastIdx = msgs.findLastIndex((m) => m.runId === payload.runId)
            if (lastIdx >= 0) {
              msgs[lastIdx] = { ...msgs[lastIdx], partial: false }
            }
            return {
              sessionChats: {
                ...state.sessionChats,
                [key]: { messages: msgs, streaming: false, streamingRunId: null },
              },
            }
          }

          if (payload.state === 'aborted' || payload.state === 'error') {
            const msgs = [...chat.messages]
            const lastIdx = msgs.findLastIndex((m) => m.runId === payload.runId)
            if (lastIdx >= 0) {
              msgs[lastIdx] = {
                ...msgs[lastIdx],
                partial: false,
                aborted: payload.state === 'aborted',
                content: payload.state === 'error'
                  ? (msgs[lastIdx].content || '') + `\n\n*[Error: ${payload.errorMessage || 'unknown'}]*`
                  : msgs[lastIdx].content,
              }
            }
            return {
              sessionChats: {
                ...state.sessionChats,
                [key]: { messages: msgs, streaming: false, streamingRunId: null },
              },
            }
          }

          return state
        })
      },
      onSessions: (sessions) => {
        set({ sessions })
        // Load history for active session
        const { activeSessionKey } = get()
        get().loadHistory(activeSessionKey)
      },
    })

    client.connect()
    set({ client, error: null, pairingRequired: false })
  },

  disconnect: () => {
    const { client } = get()
    if (client) client.disconnect()
    set({ client: null, clientState: 'disconnected' })
  },

  setActiveSession: (key) => {
    localStorage.setItem('clawd-active-session', key)
    set({ activeSessionKey: key })
    get().loadHistory(key)
  },

  createNewSession: () => {
    const key = `webchat-${uuidv4().slice(0, 8)}`
    localStorage.setItem('clawd-active-session', key)
    set((state) => ({
      activeSessionKey: key,
      sessions: [{ key, label: 'New Session', updatedAt: Date.now() }, ...state.sessions],
      sessionChats: {
        ...state.sessionChats,
        [key]: { messages: [], streaming: false, streamingRunId: null },
      },
    }))
  },

  deleteSession: async (key) => {
    const { client } = get()
    if (client) await client.deleteSession(key).catch(console.warn)
    set((state) => ({
      sessions: state.sessions.filter((s) => s.key !== key),
      activeSessionKey: state.activeSessionKey === key
        ? (state.sessions.find((s) => s.key !== key)?.key ?? 'main')
        : state.activeSessionKey,
    }))
  },

  sendMessage: async (text) => {
    const { client, activeSessionKey } = get()
    if (!client || !client.isConnected()) return

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      ts: Date.now(),
    }

    set((state) => {
      const chat = getChat(state, activeSessionKey)
      return {
        sessionChats: {
          ...state.sessionChats,
          [activeSessionKey]: {
            ...chat,
            messages: [...chat.messages, userMsg],
            streaming: true,
          },
        },
      }
    })

    try {
      await client.sendMessage(activeSessionKey, text, uuidv4())
    } catch (e) {
      console.error('[send]', e)
      set((state) => {
        const chat = getChat(state, activeSessionKey)
        return {
          sessionChats: {
            ...state.sessionChats,
            [activeSessionKey]: { ...chat, streaming: false },
          },
        }
      })
    }
  },

  abortStream: () => {
    const { client, activeSessionKey, sessionChats } = get()
    if (!client) return
    const chat = sessionChats[activeSessionKey]
    client.abortRun(activeSessionKey, chat?.streamingRunId ?? undefined).catch(console.warn)
  },

  loadHistory: async (key) => {
    const { client } = get()
    if (!client || !client.isConnected()) return

    try {
      const result = await client.loadHistory(key)
      const messages: ChatMessage[] = ((result as unknown as { messages?: unknown[] })?.messages ?? []).map(
        (m: unknown) => {
          const msg = m as Record<string, unknown>
          const role = (msg.role as string) === 'user' ? 'user' : 'assistant'
          let content = ''
          if (typeof msg.content === 'string') {
            content = msg.content
          } else if (Array.isArray(msg.content)) {
            content = (msg.content as Array<{ type: string; text?: string }>)
              .filter((c) => c.type === 'text')
              .map((c) => c.text || '')
              .join('')
          }
          return { role, content, ts: (msg.ts as number) || Date.now() }
        },
      )

      set((state) => ({
        sessionChats: {
          ...state.sessionChats,
          [key]: {
            messages,
            streaming: false,
            streamingRunId: null,
          },
        },
      }))
    } catch (e) {
      console.warn('[history]', e)
    }
  },

  dismissPairing: () => set({ pairingRequired: false }),
}))

function extractContent(message: unknown): string {
  if (!message) return ''
  const m = message as Record<string, unknown>
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) {
    return (m.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('')
  }
  return ''
}
