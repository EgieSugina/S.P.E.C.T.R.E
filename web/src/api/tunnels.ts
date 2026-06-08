import { api } from './client'

export type TunnelType = 'socks5' | 'local' | 'remote' | 'dynamic'
export type TunnelStatus = 'running' | 'stopped' | 'error'

export interface Tunnel {
  id: string
  name: string
  connection_id: string
  type: TunnelType
  local_host: string
  local_port: number
  remote_host: string
  remote_port: number
  auto_start: boolean
  status: TunnelStatus
  error_message?: string
  created_at: string
}

export interface ProxyConnection {
  id: string
  source: string
  destination: string
  started_at: string
  bytes_in: number
  bytes_out: number
}

export interface GraphNode {
  id: string
  label: string
  type: 'proxy' | 'destination' | 'source'
}

export interface GraphEdge {
  source: string
  target: string
  count: number
  active: number
}

export interface TunnelGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface TunnelStats {
  active_connections: number
  total_connections: number
  bind_addr: string
  connections?: ProxyConnection[]
  graph?: TunnelGraph
}

export const tunnelsApi = {
  list: () => api<Tunnel[]>('/tunnels'),
  get: (id: string) => api<Tunnel>(`/tunnels/${id}`),
  create: (data: Partial<Tunnel>) =>
    api<Tunnel>('/tunnels', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Tunnel>) =>
    api<Tunnel>(`/tunnels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => api(`/tunnels/${id}`, { method: 'DELETE' }),
  start: (id: string) => api<Tunnel>(`/tunnels/${id}/start`, { method: 'POST' }),
  stop: (id: string) => api<Tunnel>(`/tunnels/${id}/stop`, { method: 'POST' }),
  stats: (id: string) => api<TunnelStats>(`/tunnels/${id}/stats`),
}
