import { ApiError } from '@/api/client'

const FRIENDLY: Record<string, string> = {
  AUTH_FAILED: 'Authentication failed — check username, password, or SSH key',
  HOST_UNREACHABLE: 'Could not reach host — verify address, port, and network',
  PROXY_FAILED: 'Proxy unreachable — ensure the SOCKS5 tunnel or proxy is running',
  TIMEOUT: 'Connection timed out — host may be down or firewalled',
  VAULT_LOCKED: 'Vault is locked — unlock before connecting',
  CONNECTION_LOST: 'SSH connection lost',
  HOST_KEY_MISMATCH: 'Host key does not match known_hosts',
  NOT_FOUND: 'Connection not found',
}

export function formatConnectionError(e: unknown): string {
  if (e instanceof ApiError) {
    const base = FRIENDLY[e.code] ?? e.message
    if (FRIENDLY[e.code] && e.message && e.message !== base) {
      const detail = e.message.toLowerCase()
      const baseLower = base.toLowerCase()
      const redundant =
        detail.includes('timeout') && baseLower.includes('timeout') ||
        detail.includes('unreachable') && baseLower.includes('unreachable') ||
        detail.includes('authentication') && baseLower.includes('authentication') ||
        detail.includes('proxy') && baseLower.includes('proxy')
      if (!redundant) {
        return `${base} (${e.message})`
      }
    }
    return base
  }
  return (e as Error).message || 'Connection failed'
}

export function formatDisconnectReason(reason: string): string {
  if (!reason) return FRIENDLY.CONNECTION_LOST
  if (reason === 'user_disconnect') return 'Disconnected'

  const lower = reason.toLowerCase()
  if (lower.includes('keepalive')) return 'Connection lost — keepalive failed'
  if (lower.includes('timeout') || lower.includes('timed out')) return FRIENDLY.TIMEOUT
  if (lower.includes('reset')) return 'Connection lost — reset by remote host'
  if (lower.includes('closed') || lower.includes('ended')) return 'Connection closed by remote host'
  if (lower === 'connection lost') return FRIENDLY.CONNECTION_LOST

  // Already a full user-facing sentence (e.g. from formatConnectionError).
  if (/[.!?]$/.test(reason.trim()) || reason.includes(' — ')) return reason

  if (/^(connection|ssh)\s/i.test(reason)) {
    return reason.charAt(0).toUpperCase() + reason.slice(1)
  }

  return `Connection lost — ${reason}`
}
