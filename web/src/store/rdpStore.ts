import { create } from 'zustand'
import { rdpApi } from '@/api/rdp'

export interface RdpTab {
  id: string
  sessionId: string
  connId: string
  connectionId: string
  name: string
  width: number
  height: number
}

interface RdpStore {
  tabs: RdpTab[]
  activeTabId: string | null
  addTab: (connectionId: string, connId: string, name: string) => Promise<void>
  updateTabSession: (tabId: string, sessionId: string, connId: string, width: number, height: number) => void
  removeTab: (id: string) => void
  setActive: (id: string) => void
}

export const useRdpStore = create<RdpStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: async (connectionId, connId, name) => {
    const session = await rdpApi.create(connId)
    const tab: RdpTab = {
      id: crypto.randomUUID(),
      sessionId: session.session_id,
      connId: session.conn_id,
      connectionId,
      name,
      width: session.width ?? 1280,
      height: session.height ?? 720,
    }
    set({
      tabs: [...get().tabs, tab],
      activeTabId: tab.id,
    })
  },

  updateTabSession: (tabId, sessionId, connId, width, height) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === tabId ? { ...t, sessionId, connId, width, height } : t,
      ),
    })
  },

  removeTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (tab) rdpApi.kill(tab.sessionId).catch(() => {})
    const tabs = get().tabs.filter((t) => t.id !== id)
    set({
      tabs,
      activeTabId: tabs[0]?.id ?? null,
    })
  },

  setActive: (id) => set({ activeTabId: id }),
}))
