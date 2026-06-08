import { Connection } from '@/api/connections'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { clsx } from 'clsx'
import { Terminal, Trash2, Wifi } from 'lucide-react'

interface ConnectionCardProps {
  connection: Connection
  isActive: boolean
  vaultLocked?: boolean
  onConnect: () => void
  onDisconnect: () => void
  onDelete: () => void
  onTerminal: () => void
}

export function ConnectionCard({
  connection,
  isActive,
  vaultLocked = false,
  onConnect,
  onDisconnect,
  onDelete,
  onTerminal,
}: ConnectionCardProps) {
  return (
    <div
      className={clsx(
        'bg-surface border border-[var(--border-default)] border-l-[3px] border-l-purple-core rounded-brutal p-4 hover:border-[var(--border-hover)] transition-colors',
        !isActive && 'card-disconnected-glitch',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-sm text-[var(--text-primary)]">{connection.name}</h3>
          <p className="font-mono text-xs text-term-cyan mt-1">
            {connection.username}@{connection.host}:{connection.port}
          </p>
        </div>
        <Badge color={isActive ? 'green' : 'purple'}>{isActive ? 'live' : 'idle'}</Badge>
      </div>
      {connection.notes && (
        <p className="text-xs text-text-muted mt-2 line-clamp-2">{connection.notes}</p>
      )}
      <div className="flex gap-2 mt-4">
        {isActive ? (
          <>
            <Button variant="primary" onClick={onTerminal}>
              <Terminal size={12} className="inline mr-1" /> Terminal
            </Button>
            <Button variant="ghost" onClick={onDisconnect}>Disconnect</Button>
          </>
        ) : (
          <Button variant="primary" onClick={onConnect} title={vaultLocked ? 'Unlock vault to connect' : undefined}>
            <Wifi size={12} className="inline mr-1" /> Connect
          </Button>
        )}
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  )
}
