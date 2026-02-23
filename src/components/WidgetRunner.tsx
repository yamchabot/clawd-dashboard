import React, { useMemo, useCallback, useEffect, useRef } from 'react'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'
import type { WidgetDef } from '../store/widgets'
import { useGatewayStore } from '../store/gateway'

interface WidgetRunnerProps {
  widget: WidgetDef
}

/**
 * Executes widget code in a sandboxed Function context.
 *
 * Widget code is a JavaScript string defining a `Widget` function component.
 * Use React.createElement (no JSX transpilation in the sandbox).
 *
 * Injected globals:
 *   React, useState, useEffect, useMemo, useCallback, useRef — React hooks
 *   fetch        — native browser fetch
 *   exec(cmd, opts?)  → Promise<{stdout, stderr, exitCode}>  — runs shell commands
 *   console      — browser console
 */

/** Calls /api/exec to run a shell command in the sandbox */
async function execCmd(
  cmd: string,
  opts?: { timeout?: number; cwd?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await fetch('/api/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd, ...opts }),
  })
  if (!res.ok) throw new Error(`exec failed: HTTP ${res.status}`)
  return res.json()
}

function compileWidget(code: string): React.ComponentType {
  try {
    const wrapped = `
      ${code}
      if (typeof Widget !== 'undefined') return Widget;
      if (typeof Component !== 'undefined') return Component;
      if (typeof exports !== 'undefined' && exports.default) return exports.default;
      return null;
    `
    const fn = new Function(
      'React',
      'useState',
      'useEffect',
      'useMemo',
      'useCallback',
      'useRef',
      'exec',
      'fetch',
      'console',
      'exports',
      wrapped,
    )
    const exportsObj: Record<string, unknown> = {}
    const result = fn(
      React,
      React.useState,
      React.useEffect,
      React.useMemo,
      React.useCallback,
      React.useRef,
      execCmd,
      fetch,
      console,
      exportsObj,
    )
    const comp = result ?? exportsObj.default
    if (typeof comp === 'function') return comp as React.ComponentType
    return () => React.createElement(
      'div',
      { style: { color: 'var(--text-muted)', fontSize: '12px', padding: '8px' } },
      'Widget exported nothing. Define a function named Widget.',
    )
  } catch (e) {
    throw new Error(`Widget compile error: ${(e as Error).message}`)
  }
}

// ── Error Fallback ────────────────────────────────────────────────────────────
interface ErrorFallbackProps extends FallbackProps {
  widget: WidgetDef
}

function ErrorFallback({ error, resetErrorBoundary, widget }: ErrorFallbackProps) {
  const { sendMessage, clientState } = useGatewayStore()
  const autoSentRef = useRef(false)
  const [countdown, setCountdown] = React.useState(5)
  const isConnected = clientState === 'connected'

  const buildFixMessage = () =>
    `The widget **"${widget.title}"** (id: \`${widget.id}\`) has a runtime error:\n\n` +
    `\`\`\`\n${error.message}\n\`\`\`\n\n` +
    `Current widget code:\n\`\`\`js\n${widget.code}\n\`\`\`\n\n` +
    `Please fix the error. Respond with a \`\`\`widget block that includes the same \`id\` ` +
    `so the dashboard auto-installs the fix:\n` +
    `\`\`\`widget\n{"id":"${widget.id}","title":"${widget.title}","code":"...fixed code..."}\n\`\`\``

  // Auto-send to agent after countdown if connected
  useEffect(() => {
    if (!isConnected || autoSentRef.current) return
    if (countdown <= 0) {
      autoSentRef.current = true
      sendMessage(buildFixMessage())
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, isConnected])

  const handleFixNow = () => {
    autoSentRef.current = true
    setCountdown(-1)
    sendMessage(buildFixMessage())
  }

  const handleDismiss = () => {
    autoSentRef.current = true
    setCountdown(-1)
  }

  return (
    <div className="widget-error">
      <div style={{ fontWeight: 600 }}>⚠️ Widget Error</div>
      <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8, fontFamily: 'var(--mono)', wordBreak: 'break-word' }}>
        {error.message}
      </div>

      {isConnected && !autoSentRef.current && countdown > 0 && (
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          Asking agent to fix in {countdown}s…
        </div>
      )}
      {isConnected && autoSentRef.current && countdown !== -1 && (
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--green)' }}>
          ✓ Sent to agent — reload when ready
        </div>
      )}

      <div className="widget-error-actions">
        <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={resetErrorBoundary}>
          Retry
        </button>
        {isConnected && (
          <>
            {!autoSentRef.current && (
              <button
                className="btn btn-primary"
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={handleFixNow}
              >
                🤖 Fix Now
              </button>
            )}
            {!autoSentRef.current && countdown > 0 && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={handleDismiss}
              >
                Dismiss
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Widget Runner ─────────────────────────────────────────────────────────────
export function WidgetRunner({ widget }: WidgetRunnerProps) {
  const Component = useMemo(() => {
    try { return compileWidget(widget.code) } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.code, widget.updatedAt])

  const fallback = useCallback(
    (props: FallbackProps) => <ErrorFallback {...props} widget={widget} />,
    // Re-create fallback when widget data changes (so fix message has fresh code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widget.id, widget.code, widget.updatedAt],
  )

  if (!Component) {
    return <div className="widget-error">⚠️ Failed to compile widget.</div>
  }

  return (
    <ErrorBoundary FallbackComponent={fallback} resetKeys={[widget.id, widget.updatedAt]}>
      <div className="widget-sandbox">
        <Component />
      </div>
    </ErrorBoundary>
  )
}
