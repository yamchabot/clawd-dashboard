import { useState } from 'react'
import { useWidgetStore, type WidgetDef } from '../store/widgets'
import { useGatewayStore } from '../store/gateway'
import { WidgetRunner } from './WidgetRunner'

// ── Widget Edit Modal ─────────────────────────────────────────────────────────
function WidgetEditModal({
  widget,
  onSave,
  onClose,
}: {
  widget: Partial<WidgetDef> & { code: string }
  onSave: (data: Partial<WidgetDef>) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(widget.title ?? '')
  const [description, setDescription] = useState(widget.description ?? '')
  const [code, setCode] = useState(widget.code ?? '')
  const [size, setSize] = useState<WidgetDef['size']>(widget.size ?? 'md')

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ width: '680px', maxWidth: '95vw' }}>
        <div className="modal-title">
          {widget.id ? '✏️ Edit Widget' : '➕ New Widget'}
        </div>

        <div className="form-field">
          <label className="form-label">Title</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Widget" autoFocus />
        </div>

        <div className="form-field">
          <label className="form-label">Description (optional)</label>
          <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this widget show?" />
        </div>

        <div className="form-field">
          <label className="form-label">Size</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                style={{
                  padding: '4px 12px', borderRadius: '4px', fontSize: '12px',
                  border: `1px solid ${size === s ? 'var(--accent)' : 'var(--border)'}`,
                  background: size === s ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  color: size === s ? 'var(--accent-bright)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label className="form-label">
            Widget Code
            <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>
              Define a <code style={{ fontFamily: 'var(--mono)' }}>Widget()</code> function. Use React.createElement (no JSX). Globals: React, useState, useEffect, useMemo, useCallback, useRef, fetch, exec(cmd)
            </span>
          </label>
          <textarea
            className="form-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={`function Widget() {\n  const [data, setData] = React.useState(null);\n  useEffect(() => {\n    fetch('https://api.example.com/data').then(r => r.json()).then(setData);\n  }, []);\n  if (!data) return React.createElement('div', null, 'Loading...');\n  return React.createElement('pre', {style:{fontSize:'11px'}}, JSON.stringify(data, null, 2));\n}`}
            style={{
              fontFamily: 'var(--mono)', fontSize: '12px', minHeight: '240px',
              resize: 'vertical', lineHeight: 1.5,
            }}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!title.trim() || !code.trim()}
            onClick={() => onSave({ title: title.trim(), description: description.trim(), code, size })}
          >
            Save Widget
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Widget Card ───────────────────────────────────────────────────────────────
function WidgetCard({ widget, index, total }: { widget: WidgetDef; index: number; total: number }) {
  const { updateWidget, removeWidget, widgets, saveAll } = useWidgetStore()
  const { sendMessage } = useGatewayStore()
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleRefresh = () => {
    sendMessage(
      `Please rewrite the widget titled "${widget.title}". Its current code is:\n\`\`\`js\n${widget.code}\n\`\`\`\n` +
      `Output an improved version as a JSON widget block:\n\`\`\`widget\n{"id":"${widget.id}","title":"...","code":"..."}\n\`\`\``,
    )
  }

  const handleMoveUp = () => {
    if (index === 0) return
    const reordered = [...widgets]
    ;[reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]]
    saveAll(reordered.map((w, i) => ({ ...w, order: i })))
  }

  const handleMoveDown = () => {
    if (index === total - 1) return
    const reordered = [...widgets]
    ;[reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]]
    saveAll(reordered.map((w, i) => ({ ...w, order: i })))
  }

  return (
    <>
      <div className="widget-card">
        <div className="widget-card-header" onClick={() => setCollapsed((c) => !c)}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '10px' }}>
            {collapsed ? '▶' : '▼'}
          </span>
          <span className="widget-card-title" title={widget.description}>{widget.title}</span>
          <div className="widget-card-actions" onClick={(e) => e.stopPropagation()}>
            <button className="widget-icon-btn" onClick={handleMoveUp} disabled={index === 0} title="Move up">↑</button>
            <button className="widget-icon-btn" onClick={handleMoveDown} disabled={index === total - 1} title="Move down">↓</button>
            <button className="widget-icon-btn" onClick={handleRefresh} title="Ask agent to improve">🔄</button>
            <button className="widget-icon-btn" onClick={() => setEditing(true)} title="Edit code">✏️</button>
            {confirmDelete ? (
              <>
                <button className="widget-icon-btn danger" onClick={() => removeWidget(widget.id)} title="Confirm delete">✓</button>
                <button className="widget-icon-btn" onClick={() => setConfirmDelete(false)} title="Cancel">✕</button>
              </>
            ) : (
              <button className="widget-icon-btn danger" onClick={() => setConfirmDelete(true)} title="Delete widget">🗑</button>
            )}
          </div>
        </div>

        {!collapsed && (
          <div className="widget-card-body">
            <WidgetRunner widget={widget} onRequestRefresh={handleRefresh} />
          </div>
        )}
      </div>

      {editing && (
        <WidgetEditModal
          widget={widget}
          onClose={() => setEditing(false)}
          onSave={(updates) => {
            updateWidget(widget.id, updates)
            setEditing(false)
          }}
        />
      )}
    </>
  )
}

// ── Widget Panel ──────────────────────────────────────────────────────────────
const WIDGET_PROMPT = [
  'Please create a new dashboard widget for me.',
  'Respond with a JSON widget block like this:',
  '```widget',
  '{"title":"Widget Name","description":"What it shows","size":"md","code":"function Widget() { return React.createElement(\'div\', null, \'Hello!\'); }"}',
  '```',
  'Widget code rules:',
  '- Define a function named Widget()',
  '- Use React.createElement() — no JSX',
  '- Available globals: React, useState, useEffect, useMemo, useCallback, useRef, fetch, exec(cmd)',
  '- exec(cmd) runs a shell command in the sandbox → Promise<{stdout, stderr, exitCode}>',
  '- Use CSS variables: var(--text-primary), var(--bg-surface), var(--accent), var(--mono), etc.',
  '- For graphs, use SVG elements — no external chart libraries needed',
  '- For polling data, use setInterval inside useEffect and clear on cleanup',
  'What kind of widget would you like?',
].join('\n')

export function WidgetPanel({ width }: { width: number }) {
  const { widgets, loading, addWidget } = useWidgetStore()
  const { sendMessage } = useGatewayStore()
  const [showNew, setShowNew] = useState(false)

  const handleAskAgent = () => sendMessage(WIDGET_PROMPT)

  return (
    <div className="widget-panel" style={{ width, minWidth: width, maxWidth: width }}>
      <div className="widget-panel-header">
        <span className="widget-panel-title">
          Widgets {loading && <span style={{ fontSize: '10px', opacity: 0.5 }}>⟳</span>}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="btn btn-ghost"
            style={{ padding: '3px 8px', fontSize: '11px' }}
            onClick={() => setShowNew(true)}
            title="Create widget manually"
          >
            + New
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: '3px 8px', fontSize: '11px' }}
            onClick={handleAskAgent}
            title="Ask the AI agent to create a widget"
          >
            🤖 Ask AI
          </button>
        </div>
      </div>

      <div className="widget-grid">
        {!loading && widgets.length === 0 && (
          <div className="empty-state" style={{ minHeight: '140px' }}>
            <div className="empty-state-icon">📊</div>
            <div>No widgets yet</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Click <strong>🤖 Ask AI</strong> to have the agent create one,<br />
              or <strong>+ New</strong> to write one yourself.
            </div>
          </div>
        )}

        {widgets.map((w, i) => (
          <WidgetCard key={w.id} widget={w} index={i} total={widgets.length} />
        ))}
      </div>

      {showNew && (
        <WidgetEditModal
          widget={{ code: '', size: 'md' }}
          onClose={() => setShowNew(false)}
          onSave={async (data) => {
            await addWidget(data as Parameters<typeof addWidget>[0])
            setShowNew(false)
          }}
        />
      )}
    </div>
  )
}
