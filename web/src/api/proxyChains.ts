import { api } from './client'

export type ProxyChainHopType = 'tunnel' | 'socks5'

export interface ProxyChainHop {
  type: ProxyChainHopType
  tunnel_id?: string
  host?: string
  port?: number
}

export interface ProxyChain {
  id: string
  name: string
  hops: ProxyChainHop[]
  created_at: string
}

export const proxyChainsApi = {
  list: () => api<ProxyChain[]>('/proxy-chains'),
  get: (id: string) => api<ProxyChain>(`/proxy-chains/${id}`),
  create: (data: { name: string; hops: ProxyChainHop[] }) =>
    api<ProxyChain>('/proxy-chains', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Pick<ProxyChain, 'name' | 'hops'>>) =>
    api<ProxyChain>(`/proxy-chains/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => api(`/proxy-chains/${id}`, { method: 'DELETE' }),
}
