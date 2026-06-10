import { api } from './client'

export type HopStatus = 'alive' | 'timeout' | 'gateway' | 'local' | 'target'

export interface TraceHop {
  hop: number
  host: string
  ip?: string
  rtt_ms?: number
  status: HopStatus
}

export interface TraceResult {
  target: string
  resolved_ip?: string
  hops: TraceHop[]
  via: 'local' | 'ssh'
  tool: string
  duration_ms: number
  error?: string
}

export const traceApi = {
  traceHost: (host: string) =>
    api<TraceResult>(`/trace?host=${encodeURIComponent(host)}`),
  traceConnection: (connectionId: string, host?: string) =>
    api<TraceResult>(`/connections/${connectionId}/trace`, {
      method: 'POST',
      body: JSON.stringify(host ? { host } : {}),
    }),
}
