import { Connection } from '@/api/connections'
import { ConnectionCard } from './ConnectionCard'

interface ConnectionListProps {
  connections: Connection[]
  activeConnIds: Record<string, string>
  vaultLocked?: boolean
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
  onDelete: (id: string) => void
  onTerminal: (id: string, connId: string, name: string) => void
}

export function ConnectionList({
  connections,
  activeConnIds,
  vaultLocked = false,
  onConnect,
  onDisconnect,
  onDelete,
  onTerminal,
}: ConnectionListProps) {
  if (connections.length === 0) {
    return (
      <div className="text-center py-16 font-mono text-text-muted text-sm">
        No connections configured. Add your first target.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {connections.map((conn) => {
        const connId = activeConnIds[conn.id]
        const isActive = !!connId
        return (
          <ConnectionCard
            key={conn.id}
            connection={conn}
            isActive={isActive}
            vaultLocked={vaultLocked}
            onConnect={() => onConnect(conn.id)}
            onDisconnect={() => onDisconnect(conn.id)}
            onDelete={() => onDelete(conn.id)}
            onTerminal={() => onTerminal(conn.id, connId, conn.name)}
          />
        )
      })}
    </div>
  )
}
