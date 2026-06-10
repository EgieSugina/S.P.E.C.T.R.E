import { create } from 'zustand'
import { ApiError } from '@/api/client'
import { FileEntry, sftpApi } from '@/api/sftp'
import { formatConnectionError } from '@/lib/connectionErrors'

interface FileStore {
  connId: string | null
  currentPath: string
  entries: FileEntry[]
  loading: boolean
  error: string | null
  setConnId: (id: string | null) => Promise<void>
  navigate: (path: string) => Promise<void>
  refresh: () => Promise<void>
  onConnectionLost: (connId: string) => void
  clearError: () => void
}

export const useFileStore = create<FileStore>((set, get) => ({
  connId: null,
  currentPath: '/',
  entries: [],
  loading: false,
  error: null,

  setConnId: async (id) => {
    if (!id) {
      set({ connId: null, currentPath: '/', entries: [], error: null, loading: false })
      return
    }
    set({ connId: id, entries: [], error: null, loading: true })
    let path = '/'
    try {
      const home = await sftpApi.home(id)
      if (home.path) path = home.path
    } catch {
      // fall back to filesystem root
    }
    await get().navigate(path)
  },

  navigate: async (path) => {
    const { connId } = get()
    if (!connId) return
    set({ loading: true, currentPath: path, error: null })
    try {
      const entries = await sftpApi.list(connId, path)
      set({ entries, loading: false })
    } catch (e) {
      const msg = formatConnectionError(e)
      const lost = e instanceof ApiError && e.code === 'CONNECTION_LOST'
      set({
        loading: false,
        error: msg,
        entries: [],
        ...(lost ? { connId: null } : {}),
      })
    }
  },

  refresh: async () => {
    const { currentPath, navigate } = get()
    await navigate(currentPath)
  },

  onConnectionLost: (connId) => {
    const { connId: active } = get()
    if (active === connId) {
      set({
        connId: null,
        entries: [],
        error: 'SSH connection lost — reconnect from Connections and select again',
      })
    }
  },

  clearError: () => set({ error: null }),
}))
