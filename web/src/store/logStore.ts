import { create } from 'zustand'

export type LogType = 'in' | 'out' | 'process'
export type LogFilter = LogType | 'all'

export interface LogEntry {
  id: string
  timestamp: number
  type: LogType
  message: string
  source?: string
  detail?: string
}

const MAX_ENTRIES = 500

let entryCounter = 0

function nextId(): string {
  entryCounter += 1
  return `${Date.now()}-${entryCounter}`
}

interface LogStore {
  entries: LogEntry[]
  filter: LogFilter
  autoScroll: boolean
  expanded: boolean
  panelHeight: number
  add: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clear: () => void
  setFilter: (filter: LogFilter) => void
  setAutoScroll: (autoScroll: boolean) => void
  setExpanded: (expanded: boolean) => void
  setPanelHeight: (height: number) => void
  toggleExpanded: () => void
}

export const useLogStore = create<LogStore>((set, get) => ({
  entries: [],
  filter: 'all',
  autoScroll: true,
  expanded: false,
  panelHeight: 200,

  add: (entry) => {
    const log: LogEntry = {
      ...entry,
      id: nextId(),
      timestamp: Date.now(),
    }
    set((state) => {
      const entries = [...state.entries, log]
      if (entries.length > MAX_ENTRIES) {
        return { entries: entries.slice(entries.length - MAX_ENTRIES) }
      }
      return { entries }
    })
  },

  clear: () => set({ entries: [] }),

  setFilter: (filter) => set({ filter }),
  setAutoScroll: (autoScroll) => set({ autoScroll }),
  setExpanded: (expanded) => set({ expanded }),
  setPanelHeight: (panelHeight) =>
    set({ panelHeight: Math.min(400, Math.max(80, panelHeight)) }),
  toggleExpanded: () => set({ expanded: !get().expanded }),
}))

export function addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>) {
  useLogStore.getState().add(entry)
}
