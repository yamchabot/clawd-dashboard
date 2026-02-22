export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  runId?: string
  ts?: number
  aborted?: boolean
  partial?: boolean
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  id: string
  name: string
  input?: unknown
  output?: string
  state: 'pending' | 'running' | 'done' | 'error'
}

export interface Session {
  key: string
  label?: string
  lastMessage?: string
  derivedTitle?: string
  updatedAt?: number
  model?: string
}

export interface GatewayState {
  connected: boolean
  connecting: boolean
  error: string | null
  gatewayUrl: string
  token: string
  sessionDefaults?: {
    mainKey: string
    mainSessionKey: string
  }
}

export type ChatEvent = {
  type: 'event'
  event: 'chat'
  payload: {
    runId: string
    sessionKey: string
    seq: number
    state: 'delta' | 'final' | 'aborted' | 'error'
    message?: {
      role?: string
      content?: string | Array<{ type: string; text?: string }>
    }
    errorMessage?: string
    usage?: unknown
    stopReason?: string
  }
}
