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
 * Widget code must export a default React component, e.g.:
 *
 * ```jsx
 * function MyWidget() {
 *   return <div style={{color: 'var(--text-primary)'}}>Hello!</div>
 * }
 * export default MyWidget;
 * ```
 *
 * The following globals are injected:
 * - React, useState, useEffect, useMemo, useCallback (from React)
 * - fetch, console
 */
function compileWidget(code: string): React.ComponentType {
  // Transform basic JSX-like code to createElement calls (very naive transform)
  // For production use, you'd want a proper Babel transform.
  // Here we just evaluate the code with a module-like context.

  try {
    // We wrap the code to capture the default export
    const wrapped = `
      ${code}
      if (typeof exports !== 'undefined' && exports.default) return exports.default;
      if (typeof MyWidget !== 'undefined') return MyWidget;
      if (typeof Widget !== 'undefined') return Widget;
      if (typeof Component !== 'undefined') return Component;
      return null;
    `

    const fn = new Function(
      'React',
      'useState',
      'useEffect',
      'useMemo',
      'useCallback',
      'useRef',
      'exports',
      'console',
      'fetch',
      wrapped,
    )

    const exports: Record<string, unknown> = {}
    const result = fn(
      React,
      React.useState,
      React.useEffect,
      React.useMemo,
      React.useCallback,
      React.useRef,
      exports,
      console,
      fetch,
    )

    if (typeof result === 'function') return result as React.ComponentType
    if (typeof exports.default === 'function') return exports.default as React.ComponentType

    // Return a placeholder
    return () => React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: '12px' } }, 'Widget exported nothing.')
  } catch (e) {
    throw new Error(`Widget compilation failed: ${(e as Error).message}`)
  }
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { sendMessage } = useGatewayStore()
  return (
    <div className="widget-error">
      <div>⚠️ Widget Error</div>
      <div style={{ marginTop: '4px', opacity: 0.8 }}>{error.message}</div>
      <div className="widget-error-actions">
        <button
          className="btn btn-ghost"
          style={{ fontSize: '11px', padding: '3px 8px' }}
          onClick={resetErrorBoundary}
        >
          Retry
        </button>
        <button
          className="btn btn-primary"
          style={{ fontSize: '11px', padding: '3px 8px' }}
          onClick={() => {
            sendMessage(`The widget I have is showing this error: "${error.message}". Please fix the widget code.`)
          }}
        >
          🤖 Ask agent to fix
        </button>
      </div>
    </div>
  )
}

export function WidgetRunner({ widget, onRequestRefresh: _ }: WidgetRunnerProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const Component = useMemo(() => {
    try {
      return compileWidget(widget.code)
    } catch {
      return null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.code, widget.updatedAt])

  const fallback = useCallback((props: FallbackProps) => <ErrorFallback {...props} />, [])

  if (!Component) {
    return (
      <div className="widget-error">
        ⚠️ Failed to compile widget code.
      </div>
    )
  }

  return (
    <ErrorBoundary FallbackComponent={fallback} resetKeys={[widget.updatedAt]}>
      <div className="widget-sandbox">
        <Component />
      </div>
    </ErrorBoundary>
  )
}
