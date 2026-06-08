import { create } from 'zustand'
import { FileEntry, sftpApi } from '@/api/sftp'

interface FileStore {
  connId: string | null
  currentPath: string
  entries: FileEntry[]
  loading: boolean
  setConnId: (id: string | null) => void
  navigate: (path: string) => Promise<void>
  refresh: () => Promise<void>
}

export const useFileStore = create<FileStore>((set, get) => ({
  connId: null,
  currentPath: '/',
  entries: [],
  loading: false,

  setConnId: (id) => set({ connId: id, currentPath: '/', entries: [] }),

  navigate: async (path) => {
    const { connId } = get()
    if (!connId) return
    set({ loading: true, currentPath: path })
    try {
      const entries = await sftpApi.list(connId, path)
      set({ entries, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  refresh: async () => {
    const { currentPath, navigate } = get()
    await navigate(currentPath)
  },
}))
