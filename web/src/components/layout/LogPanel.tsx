import { useCallback, useEffect, useRef, useState } from 'react'
import { useLogStore, type LogEntry, type LogFilter, type LogType } from '@/store/logStore'

const TYPE_COLORS: Record<LogType, string> = {
  in: 'text-term-cyan',
  out: 'text-purple-bright',
  process: 'text-term-green',
}

const FILTER_OPTIONS: { value: LogFilter; label: string }[] = [
  { value: 'all', label: 'ALL' },
  { value: 'in', label: 'IN' },
  { value: 'out', label: 'OUT' },
  { value: 'process', label: 'PROC' },
]

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function LogLine({ entry, expanded, onToggle }: { entry: LogEntry; expanded: boolean; onToggle: () => void }) {
  const isError =
    entry.type === 'process' &&
    (entry.message.toLowerCase().includes('error') || entry.message.toLowerCase().includes('fail'))

  return (
    <div
      className={`group px-2 py-0.5 hover:bg-hover cursor-pointer border-l-2 border-transparent hover:border-purple-core/40 ${
        expanded ? 'bg-elevated/60' : ''
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-2 font-mono text-[11px] leading-relaxed">
        <span className="text-text-muted shrink-0 tabular-nums">{formatTime(entry.timestamp)}</span>
        <span
          className={`shrink-0 uppercase w-10 text-[10px] font-semibold tracking-wider ${
            isError ? 'text-term-red' : TYPE_COLORS[entry.type]
          }`}
        >
          {entry.type}
        </span>
        {entry.source && (
          <span className="text-text-muted shrink-0 text-[10px]">[{entry.source}]</span>
        )}
        <span className={`flex-1 min-w-0 truncate ${isError ? 'text-term-red' : 'text-text-primary'}`}>
          {entry.message}
        </span>
        {entry.detail && (
          <span className="text-text-muted text-[10px] opacity-0 group-hover:opacity-100 shrink-0">
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </div>
      {expanded && entry.detail && (
        <pre className="mt-1 ml-[4.5rem] p-2 bg-void border border-[var(--border-default)] rounded-brutal text-[10px] text-text-secondary overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {entry.detail}
        </pre>
      )}
    </div>
  )
}

export function LogPanel() {
  const entries = useLogStore((s) => s.entries)
  const filter = useLogStore((s) => s.filter)
  const autoScroll = useLogStore((s) => s.autoScroll)
  const expanded = useLogStore((s) => s.expanded)
  const panelHeight = useLogStore((s) => s.panelHeight)
  const setFilter = useLogStore((s) => s.setFilter)
  const setAutoScroll = useLogStore((s) => s.setAutoScroll)
  const toggleExpanded = useLogStore((s) => s.toggleExpanded)
  const setPanelHeight = useLogStore((s) => s.setPanelHeight)
  const clear = useLogStore((s) => s.clear)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.type === filter)

  useEffect(() => {
    if (!autoScroll || !expanded || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [filtered.length, autoScroll, expanded])

  const toggleLine = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { startY: e.clientY, startH: panelHeight }
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const delta = dragRef.current.startY - ev.clientY
        setPanelHeight(dragRef.current.startH + delta)
      }
      const onUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [panelHeight, setPanelHeight],
  )

  if (!expanded) {
    return (
      <div
        className="h-8 flex items-center justify-between px-3 border-t border-[var(--border-default)] bg-void font-mono text-[11px] cursor-pointer select-none shrink-0"
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && toggleExpanded()}
      >
        <span className="text-purple-bright tracking-widest uppercase">
          LOGS <span className="text-text-muted">({entries.length})</span>
        </span>
        <span className="text-text-muted text-[10px]">▲ expand</span>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col border-t border-[var(--border-default)] bg-void shrink-0 relative"
      style={{ height: panelHeight }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-purple-core/40 z-10"
        onMouseDown={onResizeStart}
        title="Drag to resize"
      />

      <div className="h-8 flex items-center justify-between px-3 border-b border-[var(--border-default)] bg-deep shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleExpanded}
            className="text-purple-bright font-mono text-[11px] uppercase tracking-widest hover:text-purple-glow"
          >
            LOGS <span className="text-text-muted">({entries.length})</span>
          </button>
          <div className="flex gap-1">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`px-1.5 py-0.5 font-mono text-[10px] uppercase rounded-brutal border transition-colors ${
                  filter === opt.value
                    ? 'border-purple-core text-purple-bright bg-purple-dim/30'
                    : 'border-transparent text-text-muted hover:text-text-secondary hover:border-[var(--border-hover)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-purple-core w-3 h-3"
            />
            AUTO-SCROLL
          </label>
          <button
            type="button"
            onClick={clear}
            className="font-mono text-[10px] uppercase text-text-muted hover:text-term-red border border-transparent hover:border-term-red/30 px-1.5 py-0.5 rounded-brutal"
          >
            CLEAR
          </button>
          <button
            type="button"
            onClick={toggleExpanded}
            className="font-mono text-[10px] text-text-muted hover:text-purple-bright"
          >
            ▼
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full font-mono text-[11px] text-text-muted">
            No log entries{filter !== 'all' ? ` for ${filter.toUpperCase()}` : ''}
          </div>
        ) : (
          filtered.map((entry) => (
            <LogLine
              key={entry.id}
              entry={entry}
              expanded={expandedIds.has(entry.id)}
              onToggle={() => entry.detail && toggleLine(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
