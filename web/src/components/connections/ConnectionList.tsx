import { Connection, Group } from '@/api/connections'
import { Tunnel } from '@/api/tunnels'
import { ProxyChain } from '@/api/proxyChains'
import { ConnectionCard } from './ConnectionCard'

interface ConnectionListProps {
  connections: Connection[]
  groups: Group[]
  tunnels?: Tunnel[]
  chains?: ProxyChain[]
  activeConnIds: Record<string, string>
  selectedGroupId: string | null
  vaultLocked?: boolean
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
  onDelete: (id: string) => void
  onTerminal: (id: string, connId: string, name: string) => void
  onDesktop: (id: string, connId: string, name: string) => void
  onAssignGroup: (id: string, groupId: string | null) => void
}

function filterConnections(
  connections: Connection[],
  selectedGroupId: string | null,
): Connection[] {
  if (selectedGroupId === null) return connections
  if (selectedGroupId === '__ungrouped__') {
    return connections.filter((c) => !c.group_id)
  }
  return connections.filter((c) => c.group_id === selectedGroupId)
}

function groupBySection(
  connections: Connection[],
  groups: Group[],
): { id: string | null; label: string; color?: string; items: Connection[] }[] {
  const sections: { id: string | null; label: string; color?: string; items: Connection[] }[] = []

  for (const g of groups) {
    const items = connections.filter((c) => c.group_id === g.id)
    if (items.length > 0) {
      sections.push({ id: g.id, label: g.name, color: g.color, items })
    }
  }

  const ungrouped = connections.filter((c) => !c.group_id)
  if (ungrouped.length > 0) {
    sections.push({ id: null, label: 'Ungrouped', items: ungrouped })
  }

  return sections
}

function ConnectionGrid({
  items,
  groups,
  tunnels = [],
  chains = [],
  activeConnIds,
  vaultLocked,
  onConnect,
  onDisconnect,
  onDelete,
  onTerminal,
  onDesktop,
  onAssignGroup,
}: Omit<ConnectionListProps, 'connections' | 'selectedGroupId'> & { items: Connection[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((conn) => {
        const connId = activeConnIds[conn.id]
        const isActive = !!connId
        const group = groups.find((g) => g.id === conn.group_id)
        return (
          <ConnectionCard
            key={conn.id}
            connection={conn}
            group={group}
            groups={groups}
            tunnels={tunnels}
            chains={chains}
            isActive={isActive}
            vaultLocked={vaultLocked}
            onConnect={() => onConnect(conn.id)}
            onDisconnect={() => onDisconnect(conn.id)}
            onDelete={() => onDelete(conn.id)}
            onTerminal={() => onTerminal(conn.id, connId, conn.name)}
            onDesktop={() => onDesktop(conn.id, connId, conn.name)}
            onAssignGroup={(groupId) => onAssignGroup(conn.id, groupId)}
          />
        )
      })}
    </div>
  )
}

export function ConnectionList({
  connections,
  groups,
  tunnels = [],
  chains = [],
  activeConnIds,
  selectedGroupId,
  vaultLocked = false,
  onConnect,
  onDisconnect,
  onDelete,
  onTerminal,
  onDesktop,
  onAssignGroup,
}: ConnectionListProps) {
  const filtered = filterConnections(connections, selectedGroupId)

  if (connections.length === 0) {
    return (
      <div className="text-center py-16 font-mono text-text-muted text-sm">
        No connections configured. Add your first target.
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 font-mono text-text-muted text-sm">
        No connections in this group.
      </div>
    )
  }

  const showSections = selectedGroupId === null && groups.length > 0

  if (!showSections) {
    return (
      <ConnectionGrid
        items={filtered}
        groups={groups}
        tunnels={tunnels}
        chains={chains}
        activeConnIds={activeConnIds}
        vaultLocked={vaultLocked}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onDelete={onDelete}
        onTerminal={onTerminal}
        onDesktop={onDesktop}
        onAssignGroup={onAssignGroup}
      />
    )
  }

  const sections = groupBySection(filtered, groups)

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.id ?? 'ungrouped'}>
          <div className="flex items-center gap-2 mb-3">
            {section.color && (
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: section.color }}
              />
            )}
            {!section.color && section.id === null && (
              <span className="w-2.5 h-2.5 rounded-full border border-dashed border-text-muted" />
            )}
            <h3 className="font-mono text-xs text-text-muted uppercase tracking-wider">
              {section.label}
            </h3>
            <span className="font-mono text-[10px] text-text-muted/60">
              ({section.items.length})
            </span>
          </div>
          <ConnectionGrid
            items={section.items}
            groups={groups}
            tunnels={tunnels}
            chains={chains}
            activeConnIds={activeConnIds}
            vaultLocked={vaultLocked}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onDelete={onDelete}
            onTerminal={onTerminal}
            onDesktop={onDesktop}
            onAssignGroup={onAssignGroup}
          />
        </section>
      ))}
    </div>
  )
}
