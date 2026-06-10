import { useEffect } from 'react'
import { Connection, Group } from '@/api/connections'
import { Tunnel } from '@/api/tunnels'
import { ProxyChain } from '@/api/proxyChains'
import { proxyLabel } from '@/components/connections/ProxySelector'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { MovingBorderContainer } from '@/components/shared/MovingBorder'
import { formatDisconnectReason } from '@/lib/connectionErrors'
import { useConnectionStore } from '@/store/connectionStore'
import { clsx } from 'clsx'
import {
  FolderInput,
  Loader2,
  Monitor,
  RefreshCw,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'

const CARD_ALERT_DISMISS_MS = 4500

interface ConnectionCardProps {
  connection: Connection
  group?: Group
  groups: Group[]
  tunnels?: Tunnel[]
  chains?: ProxyChain[]
  isActive: boolean
  vaultLocked?: boolean
  onConnect: () => void
  onDisconnect: () => void
  onDelete: () => void
  onTerminal: () => void
  onDesktop?: () => void
  onAssignGroup: (groupId: string | null) => void
}

export function ConnectionCard({
  connection,
  group,
  groups,
  tunnels = [],
  chains = [],
  isActive,
  vaultLocked = false,
  onConnect,
  onDisconnect,
  onDelete,
  onTerminal,
  onDesktop,
  onAssignGroup,
}: ConnectionCardProps) {
  const cardAlertReason = useConnectionStore((s) => s.cardAlerts[connection.id])
  const isConnecting = useConnectionStore((s) => !!s.connectingIds[connection.id])
  const clearCardAlert = useConnectionStore((s) => s.clearCardAlert)
  const viaProxy = proxyLabel(connection, tunnels, chains)
  const isRdp = (connection.protocol || 'ssh') === 'rdp'
  const showLostFeedback = !!cardAlertReason
  const showConnectingOverlay = isConnecting && !showLostFeedback && !isActive

  useEffect(() => {
    if (!cardAlertReason) return
    const timer = window.setTimeout(() => clearCardAlert(connection.id), CARD_ALERT_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [cardAlertReason, connection.id, clearCardAlert])

  const cardBody = (
    <>
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
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge color={isRdp ? 'purple' : 'purple'}>{isRdp ? 'RDP' : 'SSH'}</Badge>
          <Badge color={isActive ? 'green' : 'purple'}>{isActive ? 'live' : 'idle'}</Badge>
        </div>
      </div>
      {connection.notes && (
        <p className="text-xs text-text-muted mt-2 line-clamp-2">{connection.notes}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-4 items-center">
        {isActive ? (
          <>
            {isRdp ? (
              <Button variant="primary" onClick={onDesktop}>
                <Monitor size={12} className="inline mr-1" /> Desktop
              </Button>
            ) : (
              <Button variant="primary" onClick={onTerminal}>
                <Terminal size={12} className="inline mr-1" /> Terminal
              </Button>
            )}
            <Button variant="ghost" onClick={onDisconnect}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={onConnect}
            disabled={isConnecting}
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
            disabled={isConnecting}
            className="bg-deep border border-[var(--border-default)] rounded-brutal pl-7 pr-2 py-1.5 font-mono text-[10px] text-text-muted hover:text-[var(--text-primary)] focus:border-purple-core/60 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        <Button variant="danger" onClick={onDelete} disabled={isConnecting}>
          <Trash2 size={12} />
        </Button>
      </div>
    </>
  )

  const cardClasses = clsx(
    'relative bg-surface border border-[var(--border-default)] border-l-[3px] rounded-brutal p-4',
    !showLostFeedback && !showConnectingOverlay && 'hover:border-[var(--border-hover)] transition-colors',
    !isActive && !showLostFeedback && !showConnectingOverlay && 'card-disconnected-glitch',
    showLostFeedback && 'card-connection-lost-blink',
    showConnectingOverlay && 'card-connecting-pulse',
  )

  const cardStyle = { borderLeftColor: group?.color || 'var(--purple-core)' }

  const connectingOverlay = showConnectingOverlay && (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-brutal border border-purple-core/40 bg-deep/85 px-4 py-3 text-center backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 size={22} className="text-purple-bright shrink-0 animate-spin" aria-hidden />
      <p className="font-mono text-[11px] leading-snug text-purple-bright">Connecting…</p>
    </div>
  )

  const lostOverlay = showLostFeedback && (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-brutal border border-term-red/50 bg-deep/90 px-4 py-3 text-center backdrop-blur-[2px]"
      role="alert"
    >
      <WifiOff size={22} className="text-term-red shrink-0" aria-hidden />
      <p className="font-mono text-[11px] leading-snug text-term-red">
        {formatDisconnectReason(cardAlertReason)}
      </p>
      <button
        type="button"
        onClick={() => clearCardAlert(connection.id)}
        className="absolute right-2 top-2 text-text-muted hover:text-[var(--text-primary)]"
        aria-label="Dismiss alert"
      >
        <X size={12} />
      </button>
    </div>
  )

  const card = (
    <div className={cardClasses} style={cardStyle}>
      <div className={showConnectingOverlay ? 'pointer-events-none' : undefined}>{cardBody}</div>
      {connectingOverlay}
      {lostOverlay}
    </div>
  )

  if (isActive) {
    return <MovingBorderContainer>{card}</MovingBorderContainer>
  }

  return card
}
