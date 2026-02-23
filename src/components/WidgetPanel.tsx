import { useState, useRef } from 'react'
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
interface WidgetCardProps {
  widget: WidgetDef
  isDragging: boolean       // this card is currently being dragged
  insertBefore: boolean     // show "drop here" indicator above this card
  onDragStart: () => void
  onDragEnd: () => void
  onDragOverCard: (e: React.DragEvent<HTMLDivElement>) => void
  onDropOnCard: () => void
}

function WidgetCard({
  widget,
  isDragging,
  insertBefore,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOnCard,
}: WidgetCardProps) {
  const { updateWidget, removeWidget } = useWidgetStore()
  const { sendMessage } = useGatewayStore()
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragSpan, setDragSpan] = useState<{ col: number; row: number } | null>(null)

  const colSpan = dragSpan?.col ?? widget.colSpan ?? DEFAULT_COLS
  const rowSpan = dragSpan?.row ?? widget.rowSpan ?? DEFAULT_ROWS

  // ── Grid resize handle ────────────────────────────────────────────────────
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
      curCol = Math.max(1, Math.round(startCol + (ev.clientX - startX) / CELL))
      curRow = Math.max(1, Math.round(startRow + (ev.clientY - startY) / CELL))
      setDragSpan({ col: curCol, row: curRow })
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

  // ── Ask Agent ─────────────────────────────────────────────────────────────
  const handleAskAgent = (guidance: string, currentCode: string) => {
    sendMessage(
      `Please update the widget titled "${widget.title}" (id: "${widget.id}").\n\n` +
      `Current code:\n\`\`\`js\n${currentCode}\n\`\`\`\n\n` +
      `Changes requested:\n${guidance}\n\n` +
      `When you're done, respond with a \`\`\`widget block that includes the same \`id\` field ` +
      `so the dashboard auto-installs the update:\n` +
      `\`\`\`widget\n{"id":"${widget.id}","title":"${widget.title}","code":"...updated code..."}\n\`\`\`\n\n` +
      `After writing the code, briefly verify it's error-free by tracing through the logic. ` +
      `If the widget tests file (\`tests/presets.test.ts\`) could be extended for this widget, mention what test cases you'd add.`
    )
  }

  const classNames = [
    'widget-card',
    isDragging ? 'dragging' : '',
    insertBefore ? 'insert-before' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div
        className={classNames}
        style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }}
        onDragOver={onDragOverCard}
        onDrop={(e) => { e.preventDefault(); onDropOnCard() }}
      >
        {/* Drag handle is the header */}
        <div
          className="widget-card-header"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', widget.id)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          onClick={() => setCollapsed((c) => !c)}
        >
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

        {/* Grid resize handle — bottom-right corner */}
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
- Available globals: \`React\`, \`useState\`, \`useEffect\`, \`useMemo\`, \`useCallback\`, \`useRef\`, \`fetch\`, \`exec(cmd)\`, \`console\`
- \`exec(cmd)\` → \`Promise<{stdout, stderr, exitCode}>\` — runs shell commands in the sandbox
- Use CSS variables for theming: \`var(--accent)\`, \`var(--text-primary)\`, \`var(--bg-surface)\`, \`var(--green)\`, \`var(--red)\`, etc.
- For charts, use inline SVG; for polling data, use \`setInterval\` inside \`useEffect\` with cleanup
- Keep widgets self-contained — no imports, no external scripts

**Writing tests for widgets:**
After creating a widget, consider whether any logic should be verified in \`tests/presets.test.ts\`. For example:
- The widget code should compile without throwing (call \`new Function(...)\` and verify a Widget function is returned)
- If the widget has pure data-transform logic, extract it into a testable helper

**Example (minimal):**
\`\`\`widget
{"title":"Hello","size":"sm","code":"function Widget() { return React.createElement('div', {style:{padding:'8px',color:'var(--accent-bright)'}}, 'Hello, dashboard!'); }"}
\`\`\`

What kind of widget would you like to add?
`.trim()

export function WidgetPanel({ width }: { width: number }) {
  const { widgets, loading, addWidget, saveAll } = useWidgetStore()
  const { sendMessage } = useGatewayStore()
  const [showNew, setShowNew] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  // ── Drag-to-reorder state (panel-level) ────────────────────────────────────
  // draggingId state  — used for rendering (isDragging prop, end-zone visibility)
  // draggingIdRef     — used in ALL handler logic to avoid stale closures
  //                     (dragover fires before React has re-rendered after dragstart)
  // insertBeforeId state — used for rendering (insert-before highlight)
  // insertBeforeRef   — used in handleDrop to avoid stale closure
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null)
  const insertBeforeRef = useRef<string | null>(null)

  const handleDragStart = (id: string) => {
    draggingIdRef.current = id
    setDraggingId(id)
    insertBeforeRef.current = null
    setInsertBeforeId(null)
  }

  const handleDragEnd = () => {
    draggingIdRef.current = null
    setDraggingId(null)
    insertBeforeRef.current = null
    setInsertBeforeId(null)
  }

  /**
   * Called when the mouse moves over a widget card during a drag.
   * Uses draggingIdRef (not state) to avoid stale closure — dragover fires
   * immediately after dragstart, before React has flushed the state update.
   */
  const handleDragOverCard = (targetId: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const dragId = draggingIdRef.current
    if (!dragId || targetId === dragId) return

    const rect = e.currentTarget.getBoundingClientRect()
    const isTopHalf = e.clientY < rect.top + rect.height / 2

    let newInsert: string | null
    if (isTopHalf) {
      newInsert = targetId
    } else {
      const targetIdx = widgets.findIndex((w) => w.id === targetId)
      const next = widgets[targetIdx + 1]
      newInsert = next ? next.id : null // null = append to end
    }

    if (newInsert === dragId) return

    if (newInsert !== insertBeforeRef.current) {
      insertBeforeRef.current = newInsert
      setInsertBeforeId(newInsert)
    }
  }

  /** Called when dragging over the end-zone (empty area after all widgets). */
  const handleDragOverEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (insertBeforeRef.current !== null) {
      insertBeforeRef.current = null
      setInsertBeforeId(null)
    }
  }

  /** Executes the reorder on drop. Uses refs (not state) to avoid stale closures. */
  const handleDrop = () => {
    const dragId = draggingIdRef.current
    if (!dragId) return

    const list = [...widgets]
    const fromIdx = list.findIndex((w) => w.id === dragId)
    if (fromIdx === -1) { handleDragEnd(); return }

    const [item] = list.splice(fromIdx, 1)

    const target = insertBeforeRef.current
    if (target === null) {
      list.push(item)
    } else {
      const toIdx = list.findIndex((w) => w.id === target)
      if (toIdx === -1) { list.push(item) } else { list.splice(toIdx, 0, item) }
    }

    saveAll(list.map((w, i) => ({ ...w, order: i })))
    handleDragEnd()
  }

  // ── Preset / AI handlers ──────────────────────────────────────────────────
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

        {widgets.map((w) => (
          <WidgetCard
            key={w.id}
            widget={w}
            isDragging={draggingId === w.id}
            insertBefore={draggingId !== null && insertBeforeId === w.id}
            onDragStart={() => handleDragStart(w.id)}
            onDragEnd={handleDragEnd}
            onDragOverCard={(e) => handleDragOverCard(w.id, e)}
            onDropOnCard={handleDrop}
          />
        ))}

        {/* End-zone: always rendered when dragging so you can drop into empty space */}
        {draggingId && (
          <div
            className={`widget-end-zone${insertBeforeId === null ? ' targeted' : ''}`}
            onDragOver={handleDragOverEnd}
            onDrop={(e) => { e.preventDefault(); handleDrop() }}
          />
        )}
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
