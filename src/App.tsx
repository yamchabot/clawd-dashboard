import { useEffect } from 'react'
import { SessionBar } from './components/SessionBar'
import { WidgetPanel } from './components/WidgetPanel'
import { ChatPanel } from './components/ChatPanel'
import { useGatewayStore } from './store/gateway'

export function App() {
  const { connect, clientState, gatewayUrl } = useGatewayStore()

  // Auto-connect on mount. The store-level _connectLock handles StrictMode's
  // double-invocation — only the first call proceeds, the second is ignored.
  useEffect(() => {
    if (gatewayUrl && clientState === 'disconnected') {
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
