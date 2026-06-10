import type { Tunnel, TunnelStats } from '@/api/tunnels'

export type TunnelEvent =
  | { type: 'tunnel_snapshot'; tunnels: Tunnel[] }
  | {
      type: 'tunnel_started' | 'tunnel_stopped' | 'tunnel_error'
      tunnel_id: string
      status?: string
      port?: number
      error?: string
    }
  | { type: 'tunnel_stats'; tunnel_id: string; stats: TunnelStats }

export function parseTunnelEvent(data: unknown): TunnelEvent | null {
  if (!data || typeof data !== 'object' || !('type' in data)) return null
  return data as TunnelEvent
}
