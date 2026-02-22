import { useEffect, useRef, useState, useCallback } from 'react'
import { SessionBar } from './components/SessionBar'
import { WidgetPanel } from './components/WidgetPanel'
import { ChatPanel } from './components/ChatPanel'
import { useGatewayStore } from './store/gateway'

const STORAGE_KEY = 'clawd-widget-panel-width'
const MIN_WIDGET_WIDTH = 200
const MAX_WIDGET_WIDTH = 800
const DEFAULT_WIDTH = 340

function getSavedWidth(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v) {
      const n = parseInt(v, 10)
      if (n >= MIN_WIDGET_WIDTH && n <= MAX_WIDGET_WIDTH) return n
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDTH
}

export function App() {
  const { connect, clientState, gatewayUrl } = useGatewayStore()
  const [widgetWidth, setWidgetWidth] = useState(getSavedWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  useEffect(() => {
    if (gatewayUrl && clientState === 'disconnected') {
      connect()
    }
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = widgetWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [widgetWidth])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      const next = Math.min(MAX_WIDGET_WIDTH, Math.max(MIN_WIDGET_WIDTH, startWidth.current + delta))
      setWidgetWidth(next)
    }
    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Persist
      setWidgetWidth(w => {
        localStorage.setItem(STORAGE_KEY, String(w))
        return w
      })
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return (
    <div className="app">
      <SessionBar />
      <div className="main-content">
        <WidgetPanel width={widgetWidth} />
        <div className="panel-resizer" onMouseDown={onMouseDown} />
        <ChatPanel />
      </div>
    </div>
  )
}
