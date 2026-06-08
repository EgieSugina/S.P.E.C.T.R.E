import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface TerminalTabProps {
  name: string
  active: boolean
  onSelect: () => void
  onClose: () => void
}

export function TerminalTab({ name, active, onSelect, onClose }: TerminalTabProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 font-mono text-xs border-r border-[var(--border-default)] cursor-pointer',
        active ? 'bg-active text-purple-bright' : 'bg-surface text-text-secondary hover:bg-hover'
      )}
      onClick={onSelect}
    >
      <span className="truncate max-w-[120px]">{name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="text-text-muted hover:text-term-red"
      >
        <X size={12} />
      </button>
    </div>
  )
}
