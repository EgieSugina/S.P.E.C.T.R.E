import { create } from 'zustand'
import { KeyType, SSHKey, keysApi } from '@/api/keys'
import { ApiError } from '@/api/client'

interface KeyStore {
  keys: SSHKey[]
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  generate: (name: string, type: KeyType, passphrase?: string) => Promise<SSHKey>
  importKey: (name: string, pem: string, passphrase?: string) => Promise<SSHKey>
  remove: (id: string) => Promise<void>
  clearError: () => void
}

export const useKeyStore = create<KeyStore>((set, get) => ({
  keys: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const keys = await keysApi.list()
      set({ keys, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  generate: async (name, type, passphrase) => {
    set({ error: null })
    try {
      const key = await keysApi.generate({ name, type, passphrase: passphrase || undefined })
      await get().fetch()
      return key
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.code}] ${e.message}` : (e as Error).message
      set({ error: msg })
      throw e
    }
  },

  importKey: async (name, pem, passphrase) => {
    set({ error: null })
    try {
      const key = await keysApi.import({ name, pem, passphrase: passphrase || undefined })
      await get().fetch()
      return key
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.code}] ${e.message}` : (e as Error).message
      set({ error: msg })
      throw e
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      await keysApi.delete(id)
      await get().fetch()
    } catch (e) {
      const msg = e instanceof ApiError ? `[${e.code}] ${e.message}` : (e as Error).message
      set({ error: msg })
      throw e
    }
  },

  clearError: () => set({ error: null }),
}))
