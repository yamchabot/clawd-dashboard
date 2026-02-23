import { useEffect, useRef, useState, useCallback } from 'react'
import { SessionBar } from './components/SessionBar'
import { WidgetPanel } from './components/WidgetPanel'
import { ChatPanel } from './components/ChatPanel'
import { ToastManager } from './components/ToastManager'
import { useGatewayStore } from './store/gateway'

const STORAGE_KEY = 'clawd-widget-panel-width'
const MIN_WIDGET_WIDTH = 200
const DEFAULT_WIDTH = 340
const SNAP_THRESHOLD = 120   // chat panel px below which we snap closed
const COLLAPSED_CHAT_WIDTH = 44  // px width of the collapsed strip

function getSavedWidth(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v) {
      const n = parseInt(v, 10)
      if (n >= MIN_WIDGET_WIDTH) return n
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDTH
}

export function App() {
  const { connect, clientState, gatewayUrl } = useGatewayStore()
  const [widgetWidth, setWidgetWidth] = useState(getSavedWidth)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const chatCollapsedRef = useRef(false)   // mirror for drag handlers (no stale closures)
  const preCollapseWidth = useRef(getSavedWidth())
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (gatewayUrl && clientState === 'disconnected') {
      connect()
    }
  }, [])

  // ── Resizer drag (between widget panel and chat) ──────────────────────────
  const onResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = widgetWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [widgetWidth])

  // ── Collapse-button drag (drag chat back from collapsed) ──────────────────
  const onCollapseButtonMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const containerWidth = mainRef.current?.offsetWidth ?? window.innerWidth
    // Start dragging from the fully-collapsed position
    dragging.current = true
    startX.current = e.clientX
    // Treat the "start width" as the container minus collapsed strip and resizer
    startWidth.current = containerWidth - COLLAPSED_CHAT_WIDTH - 5
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const containerWidth = mainRef.current?.offsetWidth ?? window.innerWidth
      const delta = e.clientX - startX.current
      const raw = startWidth.current + delta
      const clamped = Math.max(MIN_WIDGET_WIDTH, raw)
      const chatWidth = containerWidth - clamped - 5  // 5 = resizer

      if (chatWidth < SNAP_THRESHOLD) {
        chatCollapsedRef.current = true
        setChatCollapsed(true)
      } else {
        chatCollapsedRef.current = false
        setChatCollapsed(false)
        setWidgetWidth(clamped)
      }
    }

    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setWidgetWidth(w => {
        if (!chatCollapsedRef.current) {
          localStorage.setItem(STORAGE_KEY, String(w))
          preCollapseWidth.current = w
        }
        return w
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])   // handlers use refs — no stale closure risk

  const expandChat = useCallback(() => {
    chatCollapsedRef.current = false
    setChatCollapsed(false)
    setWidgetWidth(preCollapseWidth.current)
    localStorage.setItem(STORAGE_KEY, String(preCollapseWidth.current))
  }, [])

  return (
    <div className="app">
      <ToastManager />
      <SessionBar />
      <div className="main-content" ref={mainRef}>
        <WidgetPanel width={widgetWidth} />
        {chatCollapsed ? (
          <>
            {/* Thin strip with a big drag-to-expand button */}
            <div className="chat-collapsed-strip">
              <div
                className="chat-collapsed-btn"
                onMouseDown={onCollapseButtonMouseDown}
                onClick={expandChat}
                title="Drag or click to expand chat"
              >
                <span className="chat-collapsed-label">◀ Chat</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="panel-resizer" onMouseDown={onResizerMouseDown} />
            <ChatPanel />
          </>
        )}
      </div>
    </div>
  )
}
