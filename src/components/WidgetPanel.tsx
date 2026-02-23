import { useState } from 'react'
import { useWidgetStore, type WidgetDef } from '../store/widgets'
import { useGatewayStore } from '../store/gateway'
import { WidgetRunner } from './WidgetRunner'
import { PRESET_WIDGETS, type PresetDef } from '../widgets/presets'

// ── Widget Edit Modal ─────────────────────────────────────────────────────────
function WidgetEditModal({
  widget,
  onSave,
  onClose,
  onAskAgent,
}: {
  widget: Partial<WidgetDef> & { code: string }
  onSave: (data: Partial<WidgetDef>) => void
  onClose: () => void
  onAskAgent?: (guidance: string, currentCode: string) => void
}) {
  const [title, setTitle] = useState(widget.title ?? '')
  const [description, setDescription] = useState(widget.description ?? '')
  const [code, setCode] = useState(widget.code ?? '')
  const [guidance, setGuidance] = useState('')
  const [sent, setSent] = useState(false)

  const handleAskAgent = () => {
    if (!guidance.trim() || !onAskAgent) return
    onAskAgent(guidance.trim(), code)
    setSent(true)
    setTimeout(() => onClose(), 800)
  }

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

        {/* Ask Agent section — only shown when editing an existing widget */}
        {widget.id && onAskAgent && (
          <div className="form-field" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
            <label className="form-label">
              🤖 Ask Agent to Change This Widget
              <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>
                Describe what you want — the agent will rewrite the code and auto-install it
              </span>
            </label>
            <textarea
              className="form-input"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="e.g. Add a dark/light theme toggle, show data as a bar chart, poll every 30 seconds instead of 60..."
              style={{ fontSize: '13px', minHeight: '80px', resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>

          {widget.id && onAskAgent && (
            <button
              className="btn btn-ghost"
              disabled={!guidance.trim() || sent}
              onClick={handleAskAgent}
              style={{ color: sent ? 'var(--green)' : undefined }}
            >
              {sent ? '✓ Sent to Agent' : '🤖 Ask Agent'}
            </button>
          )}

          <button
            className="btn btn-primary"
            disabled={!title.trim() || !code.trim()}
            onClick={() => onSave({ title: title.trim(), description: description.trim(), code })}
          >
            Save Widget
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Widget Library Picker ─────────────────────────────────────────────────────
function WidgetPickerModal({
  onAdd,
  onClose,
}: {
  onAdd: (preset: PresetDef) => void
  onClose: () => void
}) {
  const [added, setAdded] = useState<Set<string>>(new Set())

  const handleAdd = (preset: PresetDef) => {
    onAdd(preset)
    setAdded((prev) => new Set(prev).add(preset.id))
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ width: '700px', maxWidth: '96vw' }}>
        <div className="modal-title">📦 Widget Library</div>
        <div className="modal-subtitle">
          Click a widget to add it to your panel. You can edit it afterward.
        </div>

        <div className="preset-grid">
          {PRESET_WIDGETS.map((preset) => {
            const wasAdded = added.has(preset.id)
            return (
              <button
                key={preset.id}
                className={`preset-card${wasAdded ? ' added' : ''}`}
                onClick={() => handleAdd(preset)}
                title={preset.description}
              >
                <div className="preset-card-icon">{preset.icon}</div>
                <div className="preset-card-name">{preset.title}</div>
                <div className="preset-card-desc">{preset.description}</div>
                {wasAdded && <div className="preset-card-check">✓ Added</div>}
              </button>
            )
          })}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// 80px cells + 8px gap → one cell = 88px
const CELL = 88
const DEFAULT_COLS = 2
const DEFAULT_ROWS = 2

// ── Widget Card ───────────────────────────────────────────────────────────────
function WidgetCard({ widget, index: _index, total: _total }: { widget: WidgetDef; index: number; total: number }) {
  const { updateWidget, removeWidget } = useWidgetStore()
  const { sendMessage } = useGatewayStore()
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragSpan, setDragSpan] = useState<{ col: number; row: number } | null>(null)

  const colSpan = dragSpan?.col ?? widget.colSpan ?? DEFAULT_COLS
  const rowSpan = dragSpan?.row ?? widget.rowSpan ?? DEFAULT_ROWS

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startCol = widget.colSpan ?? DEFAULT_COLS
    const startRow = widget.rowSpan ?? DEFAULT_ROWS
    let curCol = startCol
    let curRow = startRow

    const onMove = (ev: MouseEvent) => {
      const nextCol = Math.max(1, Math.round(startCol + (ev.clientX - startX) / CELL))
      const nextRow = Math.max(1, Math.round(startRow + (ev.clientY - startY) / CELL))
      curCol = nextCol
      curRow = nextRow
      setDragSpan({ col: nextCol, row: nextRow })
    }
    const onUp = () => {
      updateWidget(widget.id, { colSpan: curCol, rowSpan: curRow })
      setDragSpan(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /** Sends a structured prompt to the agent to rewrite/update this widget. */
  const handleAskAgent = (guidance: string, currentCode: string) => {
    const title = widget.title
    const id = widget.id
    sendMessage(
      `Please update the widget titled "${title}" (id: "${id}").\n\n` +
      `Current code:\n\`\`\`js\n${currentCode}\n\`\`\`\n\n` +
      `Changes requested:\n${guidance}\n\n` +
      `When you're done, respond with a \`\`\`widget block that includes the same \`id\` field ` +
      `so the dashboard auto-installs the update:\n` +
      `\`\`\`widget\n{"id":"${id}","title":"${title}","code":"...updated code..."}\n\`\`\`\n\n` +
      `After writing the code, briefly verify it's error-free by tracing through the logic. ` +
      `If the widget tests file (\`tests/presets.test.ts\`) could be extended for this widget, mention what test cases you'd add.`
    )
  }

  return (
    <>
      <div
        className="widget-card"
        style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }}
      >
        <div className="widget-card-header" onClick={() => setCollapsed((c) => !c)}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '10px' }}>
            {collapsed ? '▶' : '▼'}
          </span>
          <span className="widget-card-title" title={widget.description}>{widget.title}</span>
          <div className="widget-card-actions" onClick={(e) => e.stopPropagation()}>
            <button className="widget-icon-btn" onClick={() => setEditing(true)} title="Edit widget code">✏️</button>
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
            <WidgetRunner widget={widget} />
          </div>
        )}

        {/* Resize handle — bottom-right corner */}
        <div
          className="widget-resize-handle"
          onMouseDown={onResizeStart}
          title={`${colSpan}×${rowSpan} — drag to resize`}
        />
      </div>

      {editing && (
        <WidgetEditModal
          widget={widget}
          onClose={() => setEditing(false)}
          onAskAgent={handleAskAgent}
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
// Sent when the user clicks "🤖 AI" — briefs the agent on the widget system
// without commanding it to create anything immediately.
const WIDGET_CONTEXT_PROMPT = `
The user is on the widget panel of the clawd-dashboard and may want to add a new widget. Here's a full briefing on how the widget system works so you can help them when they describe what they want.

**What is a widget?**
Each widget is a small JavaScript component that runs live in the dashboard. Widgets are stored server-side in \`widgets.json\` and hot-reloaded automatically via SSE. Users can add, edit, and delete them. Widgets are displayed in a CSS grid — narrow ones take one column, wide ones span the full row.

**How to deliver a widget**
When the user asks you to create or modify a widget, respond with a \`\`\`widget code block containing JSON:
\`\`\`widget
{"title":"Widget Name","description":"What it shows","size":"md","code":"function Widget() { ... }"}
\`\`\`
The dashboard will auto-detect this block and install/update the widget immediately.

**To UPDATE an existing widget, include its \`id\` field:**
\`\`\`widget
{"id":"<existing-widget-id>","title":"Widget Name","code":"...updated code..."}
\`\`\`
The dashboard will match by id and update in place.

**JSON fields:**
- \`title\` — display name (required)
- \`description\` — one-line description shown on hover (optional)
- \`size\` — layout hint: \`"sm"\` or \`"md"\` = one column (default), \`"lg"\` or \`"xl"\` = full row
- \`id\` — include ONLY when updating an existing widget (omit for new ones)
- \`code\` — the widget JavaScript (see rules below)

**Widget code rules:**
- Define a function named \`Widget()\` that returns \`React.createElement(...)\`
- **No JSX** — the code runs directly via \`new Function()\`, no transpilation
- Available globals (injected automatically): \`React\`, \`useState\`, \`useEffect\`, \`useMemo\`, \`useCallback\`, \`useRef\`, \`fetch\`, \`exec(cmd)\`, \`console\`
- \`exec(cmd)\` runs a shell command in the sandbox → \`Promise<{stdout, stderr, exitCode}>\`
- Use CSS variables for theming: \`var(--text-primary)\`, \`var(--text-secondary)\`, \`var(--text-muted)\`, \`var(--bg-surface)\`, \`var(--bg-elevated)\`, \`var(--accent)\`, \`var(--accent-bright)\`, \`var(--accent-dim)\`, \`var(--accent-glow)\`, \`var(--border)\`, \`var(--border-light)\`, \`var(--mono)\`, \`var(--green)\`, \`var(--red)\`, \`var(--yellow)\`, \`var(--blue)\`, \`var(--cyan)\`
- For charts/graphs, use inline SVG — no external libraries are available
- For live/polling data, use \`setInterval\` inside \`useEffect\` and always clear on cleanup
- For persistent state across page reloads, use \`localStorage\`
- Keep widgets self-contained — no imports, no external scripts

**Writing tests for widgets:**
After creating a widget, consider whether any logic should be verified in \`tests/presets.test.ts\`. For example:
- The widget code should compile without throwing (call \`new Function(...)\` and verify a Widget function is returned)
- If the widget has pure data-transform logic, extract it into a testable helper
- Runtime behavior (fetch, exec) can be tested with mocks in the Vitest suite

**Example (minimal):**
\`\`\`widget
{"title":"Hello","size":"sm","code":"function Widget() { return React.createElement('div', {style:{padding:'8px',color:'var(--accent-bright)'}}, 'Hello, dashboard!'); }"}
\`\`\`

What kind of widget would you like to add?
`.trim()

export function WidgetPanel({ width }: { width: number }) {
  const { widgets, loading, addWidget } = useWidgetStore()
  const { sendMessage } = useGatewayStore()
  const [showNew, setShowNew] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  const handleAskAgent = () => sendMessage(WIDGET_CONTEXT_PROMPT)

  const handleAddPreset = async (preset: PresetDef) => {
    await addWidget({
      title: preset.title,
      description: preset.description,
      code: preset.code,
      size: preset.size,
    })
  }

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
            onClick={() => setShowPicker(true)}
            title="Browse built-in widgets"
          >
            📦 Library
          </button>
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
            🤖 AI
          </button>
        </div>
      </div>

      <div className="widget-grid">
        {!loading && widgets.length === 0 && (
          <div className="empty-state" style={{ minHeight: '140px', gridColumn: '1 / -1' }}>
            <div className="empty-state-icon">📊</div>
            <div>No widgets yet</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Click <strong>📦 Library</strong> for built-in widgets,<br />
              <strong>🤖 AI</strong> to generate one, or <strong>+ New</strong> to write your own.
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

      {showPicker && (
        <WidgetPickerModal
          onAdd={handleAddPreset}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
