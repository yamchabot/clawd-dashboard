import { useEffect, useRef } from 'react'
import { SessionBar } from './components/SessionBar'
import { WidgetPanel } from './components/WidgetPanel'
import { ChatPanel } from './components/ChatPanel'
import { useGatewayStore } from './store/gateway'

export function App() {
  const { connect, clientState, gatewayUrl } = useGatewayStore()
  const hasConnected = useRef(false)

  // Auto-connect on mount if we have a URL configured
  useEffect(() => {
    if (!hasConnected.current && gatewayUrl) {
      hasConnected.current = true
      connect()
    }
  }, [])

  return (
    <div className="app">
      <SessionBar />
      <div className="main-content">
        <WidgetPanel />
        <ChatPanel />
      </div>
    </div>
  )
}
