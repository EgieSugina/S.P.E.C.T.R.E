import { Connection, Group } from '@/api/connections'
import { Tunnel } from '@/api/tunnels'
import { proxyLabel } from '@/components/connections/ProxySelector'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { clsx } from 'clsx'
import { FolderInput, RefreshCw, Terminal, Trash2, Wifi } from 'lucide-react'

interface ConnectionCardProps {
  connection: Connection
  group?: Group
  groups: Group[]
  tunnels?: Tunnel[]
  isActive: boolean
  vaultLocked?: boolean
  onConnect: () => void
  onDisconnect: () => void
  onDelete: () => void
  onTerminal: () => void
  onAssignGroup: (groupId: string | null) => void
}

export function ConnectionCard({
  connection,
  group,
  groups,
  tunnels = [],
  isActive,
  vaultLocked = false,
  onConnect,
  onDisconnect,
  onDelete,
  onTerminal,
  onAssignGroup,
}: ConnectionCardProps) {
  const viaProxy = proxyLabel(connection, tunnels)

  return (
    <div
      className={clsx(
        'bg-surface border border-[var(--border-default)] border-l-[3px] rounded-brutal p-4 hover:border-[var(--border-hover)] transition-colors',
        !isActive && 'card-disconnected-glitch',
      )}
      style={{ borderLeftColor: group?.color || 'var(--purple-core)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-mono text-sm text-[var(--text-primary)] truncate">
            {connection.name}
          </h3>
          <p className="font-mono text-xs text-term-cyan mt-1">
            {connection.username}@{connection.host}:{connection.port}
          </p>
          {viaProxy && (
            <p className="font-mono text-[10px] text-purple-bright mt-1 inline-flex items-center gap-1">
              <RefreshCw size={10} />
              {viaProxy}
            </p>
          )}
          {group && (
            <span
              className="inline-flex items-center gap-1 mt-1.5 font-mono text-[10px] px-1.5 py-0.5 rounded-brutal border border-[var(--border-default)]"
              style={{ color: group.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: group.color }} />
              {group.name}
            </span>
          )}
        </div>
        <Badge color={isActive ? 'green' : 'purple'}>{isActive ? 'live' : 'idle'}</Badge>
      </div>
      {connection.notes && (
        <p className="text-xs text-text-muted mt-2 line-clamp-2">{connection.notes}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-4 items-center">
        {isActive ? (
          <>
            <Button variant="primary" onClick={onTerminal}>
              <Terminal size={12} className="inline mr-1" /> Terminal
            </Button>
            <Button variant="ghost" onClick={onDisconnect}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={onConnect}
            title={vaultLocked ? 'Unlock vault to connect' : undefined}
          >
            <Wifi size={12} className="inline mr-1" /> Connect
          </Button>
        )}
        <div className="relative flex items-center">
          <FolderInput size={12} className="absolute left-2 text-text-muted pointer-events-none" />
          <select
            value={connection.group_id ?? ''}
            onChange={(e) => onAssignGroup(e.target.value || null)}
            className="bg-deep border border-[var(--border-default)] rounded-brutal pl-7 pr-2 py-1.5 font-mono text-[10px] text-text-muted hover:text-[var(--text-primary)] focus:border-purple-core/60 focus:outline-none cursor-pointer"
            title="Assign to group"
          >
            <option value="">Ungrouped</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  )
}
