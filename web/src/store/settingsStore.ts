import { create } from 'zustand'
import { api } from '@/api/client'
import { vaultApi } from '@/api/connections'
import { applyTheme, resolveTheme } from '@/lib/theme'
import { useUploadQueue } from '@/hooks/useUploadQueue'

function syncUploadMaxConcurrent(settings: Record<string, string>) {
  const raw = settings.upload_max_concurrent
  if (raw == null || raw === '') return
  const n = parseInt(raw, 10)
  if (!Number.isNaN(n)) {
    useUploadQueue.getState().setMaxConcurrent(n)
  }
}

interface SettingsStore {
  settings: Record<string, string>
  vaultLocked: boolean
  vaultConfigured: boolean
  vaultModalOpen: boolean
  fetch: () => Promise<void>
  update: (data: Record<string, string>) => Promise<void>
  unlockVault: (password: string) => Promise<void>
  setupVault: (password: string) => Promise<void>
  openVaultModal: () => void
  closeVaultModal: () => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: {},
  vaultLocked: true,
  vaultConfigured: false,
  vaultModalOpen: false,

  fetch: async () => {
    const [settings, vault] = await Promise.all([
      api<Record<string, string>>('/settings'),
      vaultApi.status(),
    ])
    set({
      settings,
      vaultLocked: vault.locked,
      vaultConfigured: vault.configured,
    })
    applyTheme(resolveTheme(settings.theme))
    syncUploadMaxConcurrent(settings)
  },

  update: async (data) => {
    await api('/settings', { method: 'PUT', body: JSON.stringify(data) })
    set((s) => {
      const settings = { ...s.settings, ...data }
      syncUploadMaxConcurrent(settings)
      return { settings }
    })
    if (data.theme) applyTheme(resolveTheme(data.theme))
  },

  unlockVault: async (password) => {
    await vaultApi.unlock(password)
    set({ vaultLocked: false, vaultModalOpen: false })
  },

  setupVault: async (password) => {
    await vaultApi.setup(password)
    set({ vaultLocked: false, vaultConfigured: true, vaultModalOpen: false })
  },

  openVaultModal: () => set({ vaultModalOpen: true }),

  closeVaultModal: () => set({ vaultModalOpen: false }),
}))
