import { useState } from 'react'
import { useGatewayStore } from '../store/gateway'

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { gatewayUrl, token, setGatewayConfig, connect, clientState } = useGatewayStore()
  const [url, setUrl] = useState(gatewayUrl)
  const [tok, setTok] = useState(token)

  const handleConnect = () => {
    setGatewayConfig(url, tok)
    connect()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-title">🔌 Connect to Gateway</div>
        <div className="modal-subtitle">
          Enter your OpenClaw gateway URL and token. For local setups,{' '}
          <code style={{ fontFamily: 'var(--mono)', fontSize: '12px', background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px' }}>
            ws://127.0.0.1:18789
          </code>{' '}
          with no token usually works.
        </div>

        <div className="form-field">
          <label className="form-label">Gateway URL</label>
          <input
            className="form-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="ws://127.0.0.1:18789"
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label">Token (optional)</label>
          <input
            className="form-input"
            type="password"
            value={tok}
            onChange={(e) => setTok(e.target.value)}
            placeholder="Leave blank if auth is disabled"
          />
        </div>

        <details style={{ marginTop: '8px' }}>
          <summary style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            Troubleshooting
          </summary>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <p>If you see a pairing error, run on the gateway machine:</p>
            <pre style={{ background: 'var(--bg-surface)', padding: '8px', borderRadius: '4px', marginTop: '6px', fontFamily: 'var(--mono)' }}>
              openclaw devices list{'\n'}openclaw devices approve &lt;requestId&gt;
            </pre>
            <p style={{ marginTop: '8px' }}>
              Local connections (127.0.0.1) are auto-approved.
              If device crypto isn't working, enable break-glass mode in your openclaw.json:
            </p>
            <pre style={{ background: 'var(--bg-surface)', padding: '8px', borderRadius: '4px', marginTop: '6px', fontFamily: 'var(--mono)', fontSize: '11px' }}>
              {`"gateway": { "controlUi": { "dangerouslyDisableDeviceAuth": true } }`}
            </pre>
          </div>
        </details>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConnect}>
            {clientState === 'connecting' ? '⏳ Connecting...' : '⚡ Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
