import { useUploadQueue } from '@/hooks/useUploadQueue'
import { clsx } from 'clsx'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function UploadQueuePanel() {
  const queue = useUploadQueue((s) => s.queue)
  const active = queue.filter((q) => q.status === 'uploading' || q.status === 'pending' || q.status === 'error')

  if (active.length === 0) return null

  return (
    <div className="border-t border-[var(--border-default)] p-3 bg-surface">
      <h4 className="font-mono text-[10px] text-text-muted uppercase mb-2">Upload Queue</h4>
      {active.map((item) => {
        const total = item.size || item.file.size
        const pct = total > 0 ? Math.min(100, Math.round((item.progress / total) * 100)) : 0
        return (
          <div key={item.id} className="mb-2 last:mb-0">
            <div className="flex items-center gap-2 text-xs font-mono mb-1">
              <span className="truncate flex-1">{item.file.name}</span>
              {item.status === 'uploading' && item.speed > 0 && (
                <span className="text-text-muted shrink-0">{formatBytes(item.speed)}/s</span>
              )}
              <span
                className={clsx(
                  'shrink-0 uppercase',
                  item.status === 'error' && 'text-term-red',
                  item.status === 'uploading' && 'text-purple-bright',
                  item.status === 'pending' && 'text-text-muted'
                )}
              >
                {item.status === 'uploading' ? `${pct}%` : item.status}
              </span>
            </div>
            {(item.status === 'uploading' || item.status === 'pending') && (
              <div className="h-1 bg-deep rounded-brutal overflow-hidden">
                <div
                  className="h-full bg-purple-core transition-all duration-150"
                  style={{ width: `${item.status === 'pending' ? 0 : pct}%` }}
                />
              </div>
            )}
            {item.status === 'error' && item.error && (
              <p className="text-[10px] text-term-red mt-0.5 truncate">{item.error}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
