import React, { useMemo, useCallback } from 'react'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'
import type { WidgetDef } from '../store/widgets'
import { useGatewayStore } from '../store/gateway'

interface WidgetRunnerProps {
  widget: WidgetDef
  onRequestRefresh: () => void
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
 *
 * Example:
 *   function Widget() {
 *     const [data, setData] = React.useState(null);
 *     useEffect(() => {
 *       exec('kubectl get pods --field-selector=status.phase=Failed -o json')
 *         .then(r => setData(JSON.parse(r.stdout)));
 *     }, []);
 *     return React.createElement('pre', null, JSON.stringify(data, null, 2));
 *   }
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

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { sendMessage } = useGatewayStore()
  return (
    <div className="widget-error">
      <div style={{ fontWeight: 600 }}>⚠️ Widget Error</div>
      <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8, fontFamily: 'var(--mono)', wordBreak: 'break-word' }}>
        {error.message}
      </div>
      <div className="widget-error-actions">
        <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={resetErrorBoundary}>
          Retry
        </button>
        <button
          className="btn btn-primary"
          style={{ fontSize: '11px', padding: '3px 8px' }}
          onClick={() => sendMessage(`The widget has this error: "${error.message}". Please fix the widget code.`)}
        >
          🤖 Fix
        </button>
      </div>
    </div>
  )
}

export function WidgetRunner({ widget, onRequestRefresh: _ }: WidgetRunnerProps) {
  const Component = useMemo(() => {
    try { return compileWidget(widget.code) } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.code, widget.updatedAt])

  const fallback = useCallback((props: FallbackProps) => <ErrorFallback {...props} />, [])

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
