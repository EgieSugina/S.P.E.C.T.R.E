import { api } from './client'

export interface RdpSession {
  session_id: string
  conn_id: string
  width?: number
  height?: number
  protocol?: string
}

export const rdpApi = {
  listSessions: () =>
    api<Array<{ id: string; conn_id: string; width: number; height: number }>>('/rdp/sessions'),
  create: (connId: string) =>
    api<RdpSession>('/rdp/sessions', {
      method: 'POST',
      body: JSON.stringify({ conn_id: connId }),
    }),
  get: (id: string) => api<RdpSession>(`/rdp/sessions/${id}`),
  kill: (id: string) => api(`/rdp/sessions/${id}`, { method: 'DELETE' }),
}
