import { create } from 'zustand'
import { Connection, connectionsApi } from '@/api/connections'
import { ApiError } from '@/api/client'

interface ConnectionStore {
  connections: Connection[]
  activeConnIds: Record<string, string>
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  connect: (id: string) => Promise<string>
  disconnect: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  assignGroup: (id: string, groupId: string | null) => Promise<void>
  clearError: () => void
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [],
  activeConnIds: {},
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const connections = await connectionsApi.list()
      set({ connections, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  connect: async (id: string) => {
    set({ error: null })
    try {
      const result = await connectionsApi.connect(id)
      set({
        activeConnIds: { ...get().activeConnIds, [id]: result.conn_id },
        error: null,
      })
      return result.conn_id
    } catch (e) {
      const msg =
        e instanceof ApiError ? `[${e.code}] ${e.message}` : (e as Error).message
      set({ error: msg })
      throw e
    }
  },

  disconnect: async (id: string) => {
    await connectionsApi.disconnect(id)
    const next = { ...get().activeConnIds }
    delete next[id]
    set({ activeConnIds: next })
  },

  remove: async (id: string) => {
    await connectionsApi.delete(id)
    await get().fetch()
  },

  assignGroup: async (id: string, groupId: string | null) => {
    const conn = get().connections.find((c) => c.id === id)
    if (!conn) return
    await connectionsApi.update(id, { ...conn, group_id: groupId })
    await get().fetch()
  },

  clearError: () => set({ error: null }),
}))
