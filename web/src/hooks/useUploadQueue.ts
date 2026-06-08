import { create } from 'zustand'
import { sftpApi } from '@/api/sftp'

export interface UploadItem {
  id: string
  file: File
  remotePath: string
  progress: number
  size: number
  speed: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

interface UploadQueueStore {
  maxConcurrent: number
  queue: UploadItem[]
  activeCount: number
  setMaxConcurrent: (n: number) => void
  enqueue: (connId: string, file: File, remotePath: string) => void
  processQueue: (connId: string) => void
  updateFromWS: (data: unknown) => void
  clearCompleted: () => void
}

export const useUploadQueue = create<UploadQueueStore>((set, get) => ({
  maxConcurrent: 3,
  queue: [],
  activeCount: 0,

  setMaxConcurrent: (n) => set({ maxConcurrent: Math.min(10, Math.max(1, n)) }),

  enqueue: (connId, file, remotePath) => {
    const item: UploadItem = {
      id: crypto.randomUUID(),
      file,
      remotePath,
      progress: 0,
      size: file.size,
      speed: 0,
      status: 'pending',
    }
    set((s) => ({ queue: [...s.queue, item] }))
    get().processQueue(connId)
  },

  updateFromWS: (data) => {
    const msg = data as { type?: string; job_id?: string; progress?: number; size?: number; speed?: number; error?: string }
    if (!msg.type || !msg.job_id) return

    set((s) => ({
      queue: s.queue.map((q) => {
        if (q.id !== msg.job_id) return q
        switch (msg.type) {
          case 'upload_progress':
            return {
              ...q,
              status: 'uploading' as const,
              progress: msg.progress ?? q.progress,
              size: msg.size ?? q.size,
              speed: msg.speed ?? 0,
            }
          case 'upload_done':
            return { ...q, status: 'done' as const, progress: q.size || q.file.size, speed: 0 }
          case 'upload_error':
            return { ...q, status: 'error' as const, error: msg.error || 'Upload failed', speed: 0 }
          default:
            return q
        }
      }),
    }))
  },

  clearCompleted: () =>
    set((s) => ({
      queue: s.queue.filter((q) => q.status === 'pending' || q.status === 'uploading'),
    })),

  processQueue: async (connId) => {
    const { queue, activeCount, maxConcurrent } = get()
    const pending = queue.filter((q) => q.status === 'pending')
    if (activeCount >= maxConcurrent || pending.length === 0) return

    const item = pending[0]
    set((s) => ({
      activeCount: s.activeCount + 1,
      queue: s.queue.map((q) =>
        q.id === item.id ? { ...q, status: 'uploading' as const } : q
      ),
    }))

    try {
      await sftpApi.upload(connId, item.file, item.remotePath, item.id)
      set((s) => ({
        queue: s.queue.map((q) =>
          q.id === item.id && q.status !== 'error'
            ? { ...q, status: 'done' as const, progress: q.size || q.file.size }
            : q
        ),
        activeCount: s.activeCount - 1,
      }))
    } catch (e) {
      set((s) => ({
        queue: s.queue.map((q) =>
          q.id === item.id && q.status !== 'done'
            ? { ...q, status: 'error' as const, error: (e as Error).message }
            : q
        ),
        activeCount: s.activeCount - 1,
      }))
    }
    get().processQueue(connId)
  },
}))
