import { create } from 'zustand'
import { Tunnel, TunnelStats, tunnelsApi } from '@/api/tunnels'
import { ApiError } from '@/api/client'

interface TunnelStore {
  tunnels: Tunnel[]
  stats: Record<string, TunnelStats>
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  create: (data: Partial<Tunnel>) => Promise<Tunnel>
  remove: (id: string) => Promise<void>
  start: (id: string) => Promise<void>
  stop: (id: string) => Promise<void>
  fetchStats: (id: string) => Promise<void>
  clearError: () => void
}

export const useTunnelStore = create<TunnelStore>((set, get) => ({
  tunnels: [],
  stats: {},
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const tunnels = await tunnelsApi.list()
      set({ tunnels, loading: false })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message
      set({ error: msg, loading: false })
    }
  },

  create: async (data) => {
    const tunnel = await tunnelsApi.create(data)
    set({ tunnels: [tunnel, ...get().tunnels] })
    return tunnel
  },

  remove: async (id) => {
    await tunnelsApi.delete(id)
    const stats = { ...get().stats }
    delete stats[id]
    set({
      tunnels: get().tunnels.filter((t) => t.id !== id),
      stats,
    })
  },

  start: async (id) => {
    const tunnel = await tunnelsApi.start(id)
    set({
      tunnels: get().tunnels.map((t) => (t.id === id ? tunnel : t)),
    })
    await get().fetchStats(id)
  },

  stop: async (id) => {
    const tunnel = await tunnelsApi.stop(id)
    const stats = { ...get().stats }
    delete stats[id]
    set({
      tunnels: get().tunnels.map((t) => (t.id === id ? tunnel : t)),
      stats,
    })
  },

  fetchStats: async (id) => {
    try {
      const s = await tunnelsApi.stats(id)
      set({ stats: { ...get().stats, [id]: s } })
    } catch {
      const stats = { ...get().stats }
      delete stats[id]
      set({ stats })
    }
  },

  clearError: () => set({ error: null }),
}))
