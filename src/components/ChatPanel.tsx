import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useGatewayStore } from '../store/gateway'
import { useWidgetStore } from '../store/widgets'
import type { ChatMessage } from '../gateway/types'

function parseWidgetBlocks(text: string): { widget?: { title: string; code: string }; text: string } {
  const widgetRegex = /```widget\s*\n([\s\S]*?)\n```/g
  let match
  let widget
  let cleanText = text

  while ((match = widgetRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.title && parsed.code) {
        widget = parsed
        cleanText = cleanText.replace(match[0], `*[Widget created: **${parsed.title}**]*`)
      }
    } catch {
      // not valid JSON, skip
    }
  }

  return { widget, text: cleanText }
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const { addWidget, updateWidget, widgets } = useWidgetStore()
  const [widgetHandled, setWidgetHandled] = useState(false)

  // Parse widget blocks from assistant messages
  useEffect(() => {
    if (msg.role !== 'assistant' || msg.partial || widgetHandled) return
    const { widget } = parseWidgetBlocks(msg.content)
    if (widget) {
      setWidgetHandled(true)
      // Check if widget with same title exists
      const existing = widgets.find((w) => w.title === widget.title)
      if (existing) {
        updateWidget(existing.id, { code: widget.code })
      } else {
        addWidget({ title: widget.title, code: widget.code, size: 'md' })
      }
    }
  }, [msg.content, msg.partial, msg.role])

  const { text: displayText } = parseWidgetBlocks(msg.content)

  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <div className="chat-day-divider">
        {msg.content}
      </div>
    )
  }

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className={`message-avatar ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? 'D' : '🐉'}
      </div>
      <div className="message-content-wrapper">
        <div
          className={`message-bubble ${isUser ? 'user' : 'assistant'} ${msg.partial ? 'partial' : ''} ${msg.aborted ? 'aborted' : ''}`}
        >
          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayText}
            </ReactMarkdown>
          )}
        </div>
        {msg.aborted && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            ⚠️ Response interrupted
          </div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="message-row assistant">
      <div className="message-avatar assistant">🐉</div>
      <div className="message-content-wrapper">
        <div className="message-bubble assistant" style={{ padding: '12px 16px' }}>
          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: '6px',
                  height: '6px',
                  background: 'var(--accent)',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ChatPanel() {
  const {
    activeSessionKey,
    sessionChats,
    clientState,
    sendMessage,
    abortStream,
  } = useGatewayStore()

  const chat = sessionChats[activeSessionKey] ?? { messages: [], streaming: false, streamingRunId: null }
  const { messages, streaming } = chat

  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streaming])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    await sendMessage(text)
  }, [input, streaming, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isConnected = clientState === 'connected'
  const placeholder = !isConnected
    ? 'Connect to gateway first...'
    : streaming
    ? 'Agent is responding...'
    : 'Message the agent... (Enter to send, Shift+Enter for newline)'

  return (
    <div className="chat-panel">
      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && !streaming && (
          <div className="empty-state">
            <div className="empty-state-icon">🐉</div>
            <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
              {isConnected ? `Session: ${activeSessionKey}` : 'Not connected'}
            </div>
            <div style={{ fontSize: '12px', maxWidth: '300px' }}>
              {isConnected
                ? 'Start typing to chat with the agent. You can also ask it to create dashboard widgets.'
                : 'Click the status indicator to configure and connect to your OpenClaw gateway.'}
            </div>
            {isConnected && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', maxWidth: '320px' }}>
                {[
                  'Show me running processes in the sandbox',
                  'Create a clock widget',
                  'What sessions are available?',
                  'Show gateway status',
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); textareaRef.current?.focus() }}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-dim)'
                      e.currentTarget.style.color = 'var(--accent-bright)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={`${msg.runId ?? 'msg'}-${i}`} msg={msg} />
        ))}

        {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <TypingIndicator />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <div className="chat-input-container">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={!isConnected}
            rows={1}
          />
          {streaming ? (
            <button className="chat-abort-btn" onClick={abortStream} title="Stop generation">
              ⏹
            </button>
          ) : (
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!isConnected || !input.trim()}
              title="Send (Enter)"
            >
              ↑
            </button>
          )}
        </div>
        <div className="chat-hints">
          Enter to send · Shift+Enter for newline · Ask the agent to create widgets
        </div>
      </div>
    </div>
  )
}
