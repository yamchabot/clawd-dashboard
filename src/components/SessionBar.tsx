import { useState } from 'react'
import { useGatewayStore } from '../store/gateway'
import { ConnectModal } from './ConnectModal'

export function SessionBar() {
  const {
    sessions,
    activeSessionKey,
    clientState,
    gatewayUrl,
    setActiveSession,
    createNewSession,
    deleteSession,
    connect,
    error,
    pairingRequired,
    dismissPairing,
    deviceId,
  } = useGatewayStore()

  const [showConnect, setShowConnect] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const statusLabel = {
    connected: 'Connected',
    connecting: 'Connecting',
    authenticating: 'Authenticating',
    disconnected: 'Disconnected',
    error: 'Error',
  }[clientState] ?? clientState

  const getTabLabel = (key: string) => {
    const session = sessions.find((s) => s.key === key)
    if (session?.derivedTitle) return session.derivedTitle
    if (session?.label) return session.label
    // Derive from key
    if (key === 'main' || key.startsWith('main-')) return '🏠 Main'
    return `💬 ${key.slice(-8)}`
  }

  return (
    <>
      {pairingRequired && (
        <div className="pairing-notice">
          <span>⚠️</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {deviceId ? (
              <>
                <span>
                  Device pairing required. Your device ID: <code
                    style={{ fontFamily: 'var(--mono)', fontSize: '11px', background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px', cursor: 'pointer', userSelect: 'all' }}
                    title="Click to copy device ID"
                    onClick={() => navigator.clipboard?.writeText(deviceId)}
                  >{deviceId.slice(0, 16)}…</code>
                </span>
                <span style={{ fontSize: '12px' }}>
                  On your gateway machine, run{' '}
                  <code
                    style={{ fontFamily: 'var(--mono)', fontSize: '11px', background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px', cursor: 'pointer' }}
                    title="Click to copy"
                    onClick={() => navigator.clipboard?.writeText('openclaw devices list')}
                  >openclaw devices list</code>
                  {' '}to find the pending request ID, then{' '}
                  <code
                    style={{ fontFamily: 'var(--mono)', fontSize: '11px', background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px' }}
                  >openclaw devices approve &lt;requestId&gt;</code>
                </span>
              </>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ⚠️ Could not generate device identity — Web Crypto may be unavailable on this origin.
                Use <code style={{ fontFamily: 'var(--mono)' }}>dangerouslyDisableDeviceAuth</code> as a workaround.
              </span>
            )}
          </span>
          <button
            onClick={dismissPairing}
            style={{ marginLeft: 'auto', alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--yellow)', cursor: 'pointer', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
      )}
      <div className="session-bar">
        <span className="logo">
          <span>🐉</span>
          <span>Clawd</span>
        </span>

        {/* Active session + others */}
        {/* Show active session first, then others */}
        {[
          activeSessionKey,
          ...sessions
            .filter((s) => s.key !== activeSessionKey)
            .map((s) => s.key),
        ]
          // Deduplicate
          .filter((k, i, arr) => arr.indexOf(k) === i)
          .slice(0, 12)
          .map((key) => (
            <div
              key={key}
              className={`session-tab ${key === activeSessionKey ? 'active' : ''}`}
              onClick={() => setActiveSession(key)}
              title={key}
            >
              <span className="label">{getTabLabel(key)}</span>
              {showDeleteConfirm === key ? (
                <>
                  <button
                    className="close-btn"
                    style={{ opacity: 1, color: 'var(--red)' }}
                    onClick={(e) => { e.stopPropagation(); deleteSession(key); setShowDeleteConfirm(null) }}
                    title="Confirm delete"
                  >
                    ✓
                  </button>
                  <button
                    className="close-btn"
                    style={{ opacity: 1 }}
                    onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(null) }}
                    title="Cancel"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  className="close-btn"
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(key) }}
                  title="Delete session"
                >
                  ×
                </button>
              )}
            </div>
          ))}

        {/* New session button */}
        <button
          className="new-session-btn"
          onClick={createNewSession}
          title="New session"
        >
          +
        </button>

        <div className="session-bar-spacer" />

        {/* Connection status */}
        <button
          className="connect-status"
          onClick={() => {
            if (clientState === 'disconnected' || clientState === 'error') {
              connect()
            } else {
              setShowConnect(true)
            }
          }}
          title={error ? `Error: ${error}` : `Gateway: ${gatewayUrl}`}
        >
          <span className={`status-dot ${clientState === 'connected' ? 'connected' : clientState === 'connecting' || clientState === 'authenticating' ? 'connecting' : 'error'}`} />
          <span>{statusLabel}</span>
          {error && clientState !== 'connected' && (
            <span title={error} style={{ color: 'var(--red)', fontSize: '11px' }}>
              {error.slice(0, 30)}
            </span>
          )}
        </button>

        <button
          className="btn btn-ghost"
          style={{ padding: '4px 10px', fontSize: '12px' }}
          onClick={() => setShowConnect(true)}
          title="Configure gateway connection"
        >
          ⚙️
        </button>
      </div>

      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </>
  )
}
