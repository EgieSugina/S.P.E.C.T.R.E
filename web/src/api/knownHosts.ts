import { api } from './client'

export interface KnownHost {
  id: string
  host: string
  port: number
  key_type: string
  fingerprint: string
  created_at: string
  updated_at: string
}

export interface HostKeyMismatchDetails {
  host: string
  port: number
  expected_fingerprint: string
  received_fingerprint: string
  received_key: string
  key_type: string
}

export const knownHostsApi = {
  list: () => api<KnownHost[]>('/known-hosts'),
  trust: (data: {
    host: string
    port: number
    key_type: string
    fingerprint: string
    key_data: string
  }) =>
    api('/known-hosts/trust', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => api(`/known-hosts/${id}`, { method: 'DELETE' }),
}
