import { FileEntry } from '@/api/sftp'
import { Folder, File, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

interface FileTreeProps {
  entries: FileEntry[]
  currentPath: string
  selectedPaths: Set<string>
  onNavigate: (path: string) => void
  onDownload: (path: string) => void
  onDelete: (path: string) => void
  onToggleSelect: (path: string) => void
}

export function FileTree({
  entries,
  currentPath,
  selectedPaths,
  onNavigate,
  onDownload,
  onDelete,
  onToggleSelect,
}: FileTreeProps) {
  const parent = currentPath === '/' ? null : currentPath.replace(/\/[^/]+$/, '') || '/'

  return (
    <div className="font-mono text-xs">
      {parent && (
        <button
          onClick={() => onNavigate(parent)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-hover text-text-secondary"
        >
          <ChevronRight size={14} className="rotate-180" /> ..
        </button>
      )}
      {entries.map((entry) => {
        const selected = selectedPaths.has(entry.path)
        return (
          <div
            key={entry.path}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 hover:bg-hover group',
              entry.is_dir ? 'cursor-pointer' : '',
              selected && 'bg-purple-core/10 border-l-2 border-purple-core'
            )}
            onClick={() => entry.is_dir && onNavigate(entry.path)}
          >
            <input
              type="checkbox"
              checked={selected}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleSelect(entry.path)}
              className="accent-purple-core shrink-0 cursor-pointer"
            />
            {entry.is_dir ? (
              <Folder size={14} className="text-purple-bright shrink-0" />
            ) : (
              <File size={14} className="text-text-muted shrink-0" />
            )}
            <span className="flex-1 truncate">{entry.name}</span>
            <span className="text-text-muted text-[10px] hidden group-hover:inline">
              {!entry.is_dir && `${(entry.size / 1024).toFixed(1)}K`}
            </span>
            {!entry.is_dir && (
              <div className="hidden group-hover:flex gap-1">
                <button
                  className="text-purple-bright hover:underline"
                  onClick={(e) => { e.stopPropagation(); onDownload(entry.path) }}
                >
                  DL
                </button>
                <button
                  className="text-term-red hover:underline"
                  onClick={(e) => { e.stopPropagation(); onDelete(entry.path) }}
                >
                  DEL
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
