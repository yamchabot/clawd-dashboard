import { useState } from 'react'
import { useWidgetStore, type WidgetDef } from '../store/widgets'
import { useGatewayStore } from '../store/gateway'
import { WidgetRunner } from './WidgetRunner'

function WidgetCard({ widget }: { widget: WidgetDef }) {
  const { removeWidget, updateWidget } = useWidgetStore()
  const { sendMessage } = useGatewayStore()
  const [collapsed, setCollapsed] = useState(false)

  const handleRefresh = () => {
    sendMessage(
      `Please rewrite the widget titled "${widget.title}" (id: ${widget.id}). ` +
      `The current code is:\n\`\`\`\n${widget.code}\n\`\`\`\n` +
      `Output a new version as a widget code block.`
    )
  }

  const handleEdit = () => {
    const newTitle = window.prompt('Widget title:', widget.title)
    if (newTitle !== null && newTitle.trim()) {
      updateWidget(widget.id, { title: newTitle.trim() })
    }
  }

  return (
    <div className="widget-card">
      <div className="widget-card-header" onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{collapsed ? '▶' : '▼'}</span>
        <span className="widget-card-title">{widget.title}</span>
        <div className="widget-card-actions" onClick={(e) => e.stopPropagation()}>
          <button className="widget-icon-btn" onClick={handleRefresh} title="Ask agent to refresh">
            🔄
          </button>
          <button className="widget-icon-btn" onClick={handleEdit} title="Rename">
            ✏️
          </button>
          <button
            className="widget-icon-btn danger"
            onClick={() => removeWidget(widget.id)}
            title="Remove widget"
          >
            🗑
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="widget-card-body">
          <WidgetRunner widget={widget} onRequestRefresh={handleRefresh} />
        </div>
      )}
    </div>
  )
}

// Built-in: sandbox info widget placeholder
const BUILTIN_WIDGETS: WidgetDef[] = [
  {
    id: '__builtin_processes',
    title: '🖥 Sandbox Processes',
    code: `
function Widget() {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    fetch('/api/sandbox/processes')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return React.createElement('div', {style:{color:'var(--text-muted)',fontSize:'12px'}}, 'Loading...');
  if (!data) return React.createElement('div', {style:{color:'var(--text-muted)',fontSize:'12px'}}, 'Ask the agent: "show me running processes in the sandbox"');
  return React.createElement('pre', {style:{fontSize:'11px',fontFamily:'var(--mono)',color:'var(--text-secondary)',overflow:'auto'}}, JSON.stringify(data, null, 2));
}
    `.trim(),
    createdAt: 0,
    updatedAt: 0,
    size: 'md',
  },
]

export function WidgetPanel({ width }: { width: number }) {
  const { widgets } = useWidgetStore()
  const { sendMessage } = useGatewayStore()

  const handleAddWidget = () => {
    sendMessage(
      'Create a new dashboard widget for me. Respond with a widget code block in this format:\n' +
      '```widget\n' +
      '{"title": "My Widget", "code": "function Widget() { return <div>Hello!</div>; }"}\n' +
      '```\n' +
      'The widget code should be a plain JavaScript/React function component. ' +
      'Use React.createElement for JSX (no transpilation). ' +
      'Available globals: React, useState, useEffect, useMemo, useCallback, useRef, fetch, console. ' +
      'Use CSS variables like var(--text-primary), var(--bg-surface), var(--accent) for styling. ' +
      'What kind of widget would you like? Or tell me what info you want to see.'
    )
  }

  return (
    <div className="widget-panel" style={{ width, minWidth: width, maxWidth: width }}>
      <div className="widget-panel-header">
        <span className="widget-panel-title">Widgets</span>
        <button
          className="btn btn-ghost"
          style={{ padding: '3px 8px', fontSize: '11px' }}
          onClick={handleAddWidget}
          title="Create a new widget via AI"
        >
          + New
        </button>
      </div>

      <div className="widget-grid">
        {widgets.length === 0 && (
          <div className="empty-state" style={{ minHeight: '120px' }}>
            <div className="empty-state-icon">📊</div>
            <div>No widgets yet</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Ask the agent to create one
            </div>
          </div>
        )}

        {widgets.map((w) => (
          <WidgetCard key={w.id} widget={w} />
        ))}

        <button className="add-widget-btn" onClick={handleAddWidget}>
          <span>+</span>
          <span>Add widget via AI</span>
        </button>
      </div>
    </div>
  )
}
