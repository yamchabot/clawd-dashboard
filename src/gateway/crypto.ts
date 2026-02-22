/**
 * Device identity + signing for OpenClaw gateway handshake.
 * Keys are persisted in localStorage and reused across sessions.
 *
 * Format matches the official OpenClaw Control UI:
 *   - Device ID = lowercase hex SHA-256 of raw 32-byte public key
 *   - publicKey = raw 32-byte Ed25519 key in base64url (NOT SPKI)
 *   - Signed payload format determined by gateway's verifier
 */

const STORAGE_KEY = 'clawd-dashboard:device-keypair'

export interface DeviceIdentity {
  id: string
  publicKeyRaw: string   // base64url of raw 32-byte key
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
}

// ─── Binary helpers ──────────────────────────────────────────────────────────

function buf2hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function buf2b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ─── Key generation ──────────────────────────────────────────────────────────

async function generateKeypair(): Promise<DeviceIdentity> {
  // Generate Ed25519 keypair
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  )

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)

  // Export raw public key bytes (32 bytes for Ed25519)
  // JWK 'x' field is the raw public key in base64url
  const publicKeyRaw = publicKeyJwk.x as string  // already base64url, 43 chars

  // Device ID = SHA-256 of the raw public key bytes, expressed as lowercase hex
  // Decode the base64url raw key to bytes, then SHA-256 hash it
  const rawBytes = b64urlToBytes(publicKeyRaw)
  const hashBuf = await crypto.subtle.digest('SHA-256', rawBytes)
  const id = buf2hex(hashBuf)

  return { id, publicKeyRaw, publicKeyJwk, privateKeyJwk }
}

function b64urlToBytes(b64url: string): Uint8Array {
  // Restore padding and convert base64url to standard base64
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    b64url.length + (4 - b64url.length % 4) % 4, '='
  )
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as DeviceIdentity
      if (parsed.id && parsed.publicKeyRaw && parsed.publicKeyJwk && parsed.privateKeyJwk) {
        return parsed
      }
    } catch { /* fall through */ }
  }
  const identity = await generateKeypair()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
  return identity
}

// ─── Signing ─────────────────────────────────────────────────────────────────

export interface DeviceAuthParams {
  identity: DeviceIdentity
  connectNonce: string   // from connect.challenge
  clientId: string       // e.g. "openclaw-control-ui"
  clientMode: string     // e.g. "webchat"
  role: string           // e.g. "operator"
  scopes: string[]
  token?: string | null
}

export async function buildDeviceAuth(params: DeviceAuthParams): Promise<{
  id: string
  publicKey: string
  signature: string
  signedAt: number
  nonce: string
}> {
  const { identity, connectNonce, clientId, clientMode, role, scopes, token } = params
  const signedAt = Date.now()

  // Signed payload — matches official OpenClaw Control UI format:
  // "v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce"
  const scopeStr = scopes.join(',')
  const tokenStr = token ?? ''
  const payload = [
    'v2',
    identity.id,
    clientId,
    clientMode,
    role,
    scopeStr,
    String(signedAt),
    tokenStr,
    connectNonce,
  ].join('|')

  // Import private key from JWK
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    identity.privateKeyJwk,
    { name: 'Ed25519' },
    false,
    ['sign'],
  )

  // Sign
  const data = new TextEncoder().encode(payload)
  const signatureBuf = await crypto.subtle.sign('Ed25519', privateKey, data)

  return {
    id: identity.id,
    publicKey: identity.publicKeyRaw,   // raw 32-byte key in base64url
    signature: buf2b64url(signatureBuf),
    signedAt,
    nonce: connectNonce,
  }
}
