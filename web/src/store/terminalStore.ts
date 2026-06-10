import { create } from 'zustand'
import { sessionsApi } from '@/api/connections'

export interface TerminalTab {
  id: string
  sessionId: string
  connId: string
  connectionId: string
  name: string
}

interface TerminalStore {
  tabs: TerminalTab[]
  activeTabId: string | null
  addTab: (connectionId: string, connId: string, name: string) => Promise<void>
  updateTabSession: (tabId: string, sessionId: string, connId: string) => void
  removeTab: (id: string) => void
  setActive: (id: string) => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: async (connectionId, connId, name) => {
    const session = await sessionsApi.create(connId)
    const tab: TerminalTab = {
      id: crypto.randomUUID(),
      sessionId: session.session_id,
      connId: session.conn_id,
      connectionId,
      name,
    }
    set({
      tabs: [...get().tabs, tab],
      activeTabId: tab.id,
    })
  },

  updateTabSession: (tabId, sessionId, connId) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === tabId ? { ...t, sessionId, connId } : t,
      ),
    })
  },

  removeTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (tab) sessionsApi.kill(tab.sessionId).catch(() => {})
    const tabs = get().tabs.filter((t) => t.id !== id)
    set({
      tabs,
      activeTabId: tabs[0]?.id ?? null,
    })
  },

  setActive: (id) => set({ activeTabId: id }),
}))
