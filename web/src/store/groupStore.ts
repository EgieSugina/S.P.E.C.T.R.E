import { create } from 'zustand'
import { Group, groupsApi } from '@/api/connections'
import { ApiError } from '@/api/client'

interface GroupStore {
  groups: Group[]
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  create: (data: Partial<Group>) => Promise<Group>
  update: (id: string, data: Partial<Group>) => Promise<Group>
  remove: (id: string) => Promise<void>
  clearError: () => void
}

export const useGroupStore = create<GroupStore>((set, get) => ({
  groups: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const groups = await groupsApi.list()
      set({ groups, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  create: async (data) => {
    set({ error: null })
    try {
      const group = await groupsApi.create(data)
      await get().fetch()
      return group
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.code}] ${e.message}` : (e as Error).message
      set({ error: msg })
      throw e
    }
  },

  update: async (id, data) => {
    set({ error: null })
    try {
      const group = await groupsApi.update(id, data)
      await get().fetch()
      return group
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.code}] ${e.message}` : (e as Error).message
      set({ error: msg })
      throw e
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      await groupsApi.delete(id)
      await get().fetch()
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.code}] ${e.message}` : (e as Error).message
      set({ error: msg })
      throw e
    }
  },

  clearError: () => set({ error: null }),
}))

export const GROUP_COLORS = [
  '#7c3aed',
  '#a78bfa',
  '#39ff14',
  '#00ffff',
  '#ffb700',
  '#3b82f6',
  '#ff2d55',
  '#db2777',
]
