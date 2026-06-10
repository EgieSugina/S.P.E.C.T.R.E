import { api } from './client'

export interface Connection {
  id: string
  name: string
  group_id?: string | null
  host: string
  port: number
  username: string
  auth_type: string
  password?: string
  private_key_id?: string
  tags?: string
  notes?: string
  keep_alive_interval: number
  proxy_tunnel_id?: string | null
  proxy_type?: string
  proxy_host?: string
  proxy_port?: number
  created_at: string
  last_connected_at?: string
}

export interface Group {
  id: string
  name: string
  color: string
  sort_order: number
}

export const connectionsApi = {
  list: () => api<Connection[]>('/connections'),
  get: (id: string) => api<Connection>(`/connections/${id}`),
  create: (data: Partial<Connection>) =>
    api<Connection>('/connections', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Connection>) =>
    api<Connection>(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => api(`/connections/${id}`, { method: 'DELETE' }),
  connect: (id: string) =>
    api<{ conn_id: string; status: string }>(`/connections/${id}/connect`, { method: 'POST' }),
  disconnect: (id: string) =>
    api(`/connections/${id}/disconnect`, { method: 'POST' }),
  status: (id: string) =>
    api<{ status: string; conn_id?: string }>(`/connections/${id}/status`),
}

export const groupsApi = {
  list: () => api<Group[]>('/groups'),
  create: (data: Partial<Group>) =>
    api<Group>('/groups', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Group>) =>
    api<Group>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => api(`/groups/${id}`, { method: 'DELETE' }),
}

export const vaultApi = {
  status: () => api<{ locked: boolean; configured: boolean }>('/vault/status'),
  setup: (password: string) =>
    api('/vault/setup', { method: 'POST', body: JSON.stringify({ password }) }),
  unlock: (password: string) =>
    api('/vault/unlock', { method: 'POST', body: JSON.stringify({ password }) }),
  lock: () => api('/vault/lock', { method: 'POST' }),
}

export const sessionsApi = {
  list: () => api<Array<{ id: string; conn_id: string; account_id: string }>>('/sessions'),
  create: (connId: string, cols = 120, rows = 40) =>
    api<{ session_id: string; conn_id: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ conn_id: connId, cols, rows }),
    }),
  kill: (id: string) => api(`/sessions/${id}`, { method: 'DELETE' }),
}
