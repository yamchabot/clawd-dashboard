import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Toast {
  id: string
  level: 'error' | 'warn'
  message: string
  count: number
}

// ── Singleton interceptor ─────────────────────────────────────────────────────
// Installed once for the lifetime of the page. Broadcasts to all registered
// listeners (normally just one ToastManager instance).

type Listener = (level: 'error' | 'warn', message: string) => void
const _listeners: Set<Listener> = new Set()
let _installed = false

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.message
      if (typeof a === 'object' && a !== null) {
        try { return JSON.stringify(a) } catch { return String(a) }
      }
      return String(a)
    })
    .join(' ')
    .trim()
    .slice(0, 400)
}

function emit(level: 'error' | 'warn', message: string) {
  if (!message) return
  _listeners.forEach((l) => l(level, message))
}

function install() {
  if (_installed) return
  _installed = true

  // console.error only — warn is too noisy (React internals, gateway system messages)
  const origError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    origError(...args)
    emit('error', formatArgs(args))
  }

  // Uncaught JS errors
  window.addEventListener('error', (e) => {
    const msg = e.error instanceof Error
      ? `${e.error.message}\n  at ${e.filename}:${e.lineno}`
      : e.message || 'Unknown error'
    emit('error', msg)
  })

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason instanceof Error
      ? e.reason.message
      : `Unhandled rejection: ${String(e.reason)}`
    emit('error', msg)
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
const MAX_TOASTS = 6
const WARN_AUTODISMISS_MS = 8_000  // warnings auto-dismiss; errors stay until closed

export function ToastManager() {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Track per-message dedup: key → last-seen timestamp
  const recentRef = useRef<Map<string, number>>(new Map())

  const push = useCallback((level: 'error' | 'warn', message: string) => {
    const key = message.slice(0, 120)
    const now = Date.now()
    const lastSeen = recentRef.current.get(key) ?? 0

    setToasts((prev) => {
      // If same message is already showing, just bump the count
      const existIdx = prev.findIndex((t) => t.message === message)
      if (existIdx >= 0) {
        const next = [...prev]
        next[existIdx] = { ...next[existIdx], count: next[existIdx].count + 1 }
        return next
      }

      // Suppress if the same message was seen < 1s ago (React StrictMode double-fires)
      if (now - lastSeen < 1000) return prev
      recentRef.current.set(key, now)

      const toast: Toast = {
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        level,
        message,
        count: 1,
      }
      return [toast, ...prev].slice(0, MAX_TOASTS)
    })
  }, [])

  // Register listener
  useEffect(() => {
    install()
    _listeners.add(push)
    return () => { _listeners.delete(push) }
  }, [push])

  // Auto-dismiss warnings
  useEffect(() => {
    if (toasts.some((t) => t.level === 'warn')) {
      const t = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.level !== 'warn'))
      }, WARN_AUTODISMISS_MS)
      return () => clearTimeout(t)
    }
  }, [toasts])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const dismissAll = useCallback(() => setToasts([]), [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" role="log" aria-live="polite">
      {toasts.length > 1 && (
        <button className="toast-dismiss-all" onClick={dismissAll}>
          Clear all ({toasts.length})
        </button>
      )}
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.level}`} role="alert">
          <div className="toast-header">
            <span className="toast-icon" aria-hidden="true">
              {toast.level === 'error' ? '⛔' : '⚠️'}
            </span>
            <span className="toast-title">
              {toast.level === 'error' ? 'Error' : 'Warning'}
            </span>
            {toast.count > 1 && (
              <span className="toast-count" title={`Occurred ${toast.count} times`}>
                ×{toast.count}
              </span>
            )}
            <button
              className="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <pre className="toast-message">{toast.message}</pre>
        </div>
      ))}
    </div>
  )
}
