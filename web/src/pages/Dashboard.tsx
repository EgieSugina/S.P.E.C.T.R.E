import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  Lock,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Terminal,
  Unlock,
  Zap,
} from 'lucide-react'
import { useConnectionStore } from '@/store/connectionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useTunnelStore } from '@/store/tunnelStore'
import { useTerminalStore } from '@/store/terminalStore'
import { useLogStore } from '@/store/logStore'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { DashboardCard } from '@/components/dashboard/DashboardCard'
import { api } from '@/api/client'
import { sessionsApi } from '@/api/connections'
import { SpectreLogo } from '@/components/layout/SpectreLogo'

interface SystemStatus {
  version: string
  connections: number
  sessions: number
  uptime: string
}

interface BackendSession {
  id: string
  conn_id: string
  account_id: string
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatServerTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour12: false,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
  delay,
}: {
  label: string
  value: string | number
  icon: typeof Server
  accent?: 'green' | 'purple' | 'amber' | 'cyan'
  delay: number
}) {
  const accentClass = {
    green: 'text-term-green border-term-green/30',
    purple: 'text-purple-bright border-purple-core/30',
    amber: 'text-term-amber border-term-amber/30',
    cyan: 'text-term-cyan border-term-cyan/30',
  }[accent ?? 'purple']

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      className={`border border-[var(--border-default)] border-l-[3px] border-l-purple-core rounded-brutal bg-elevated px-4 py-3 flex items-center gap-3 ${accentClass}`}
    >
      <div className="p-2 rounded-brutal bg-surface border border-[var(--border-default)]">
        <Icon size={16} />
      </div>
      <div>
        <p className="font-mono text-[10px] text-text-muted uppercase">{label}</p>
        <p className="font-display text-xl text-text-primary tabular-nums">{value}</p>
      </div>
    </motion.div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { connections, activeConnIds, error, fetch, connect, clearError } = useConnectionStore()
  const { vaultLocked, vaultConfigured, fetch: fetchSettings, openVaultModal } = useSettingsStore()
  const { tunnels, fetch: fetchTunnels } = useTunnelStore()
  const { tabs, setActive } = useTerminalStore()
  const logEntries = useLogStore((s) => s.entries)
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [backendSessions, setBackendSessions] = useState<BackendSession[]>([])

  useEffect(() => {
    fetch()
    fetchSettings()
    fetchTunnels()
    api<SystemStatus>('/system/status').then(setStatus).catch(() => {})
    sessionsApi
      .list()
      .then(setBackendSessions)
      .catch(() => setBackendSessions([]))
  }, [fetch, fetchSettings, fetchTunnels])

  const activeSessionCount = status?.sessions ?? backendSessions.length
  const runningTunnels = tunnels.filter((t) => t.status === 'running')

  const recentConnections = useMemo(() => {
    return [...connections]
      .sort((a, b) => {
        const ta = a.last_connected_at ? new Date(a.last_connected_at).getTime() : 0
        const tb = b.last_connected_at ? new Date(b.last_connected_at).getTime() : 0
        return tb - ta
      })
      .slice(0, 5)
  }, [connections])

  const activityFeed = useMemo(() => [...logEntries].slice(-5).reverse(), [logEntries])

  const vaultLabel = !vaultConfigured ? 'Not set up' : vaultLocked ? 'Locked' : 'Unlocked'
  const vaultColor = !vaultConfigured ? 'amber' : vaultLocked ? 'amber' : 'green'

  const handleQuickConnect = async (id: string) => {
    if (vaultLocked || !vaultConfigured) {
      openVaultModal()
      return
    }
    clearError()
    try {
      await connect(id)
      navigate('/terminal')
    } catch {
      // error stored in connectionStore
    }
  }

  const openTerminalTab = (tabId: string) => {
    setActive(tabId)
    navigate('/terminal')
  }

  return (
    <div className="p-4 md:p-6 space-y-5 overflow-auto h-full">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-[var(--border-default)] border-l-[3px] border-l-purple-core rounded-brutal px-4 py-3 bg-surface/80"
      >
        <div className="flex items-center gap-4 min-w-0">
          <SpectreLogo variant="navbar" className="scale-110 origin-left" />
          <p className="font-mono text-xs text-text-secondary italic hidden sm:block border-l border-[var(--border-default)] pl-4">
            You were never here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color="green">{Object.keys(activeConnIds).length} active</Badge>
          <Badge color="purple">{connections.length} targets</Badge>
          {status && <Badge color="purple">v{status.version}</Badge>}
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="SSH Sessions"
          value={activeSessionCount}
          icon={Terminal}
          accent="green"
          delay={0.05}
        />
        <StatTile
          label="Connections"
          value={connections.length}
          icon={Server}
          accent="cyan"
          delay={0.1}
        />
        <StatTile
          label="Running Tunnels"
          value={runningTunnels.length}
          icon={RefreshCw}
          accent="purple"
          delay={0.15}
        />
        <StatTile
          label="Vault"
          value={vaultLabel}
          icon={vaultLocked || !vaultConfigured ? Lock : Unlock}
          accent={vaultColor === 'green' ? 'green' : 'amber'}
          delay={0.2}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex flex-wrap gap-2"
      >
        <Button onClick={() => navigate('/connections')} className="inline-flex items-center gap-2">
          <Plus size={14} />
          New Connection
        </Button>
        <Button variant="ghost" onClick={() => navigate('/terminal')} className="inline-flex items-center gap-2">
          <Terminal size={14} />
          Open Terminal
        </Button>
        <Button variant="ghost" onClick={() => navigate('/proxy')} className="inline-flex items-center gap-2">
          <Zap size={14} />
          Start Proxy
        </Button>
      </motion.div>

      {(vaultLocked || !vaultConfigured) && (
        <p className="font-mono text-xs text-term-amber">
          {vaultConfigured
            ? 'Vault locked — unlock to connect or manage credentials.'
            : 'Set up the security vault in Settings to save credentials.'}
        </p>
      )}
      {error && (
        <p className="font-mono text-xs text-term-red" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardCard
          title="Active Sessions"
          delay={0.2}
          action={
            <button
              type="button"
              onClick={() => navigate('/terminal')}
              className="font-mono text-[10px] text-purple-bright hover:underline uppercase"
            >
              View all
            </button>
          }
        >
          {tabs.length === 0 && backendSessions.length === 0 ? (
            <p className="font-mono text-xs text-text-muted">No open terminal sessions.</p>
          ) : (
            <ul className="space-y-2">
              {tabs.map((tab) => (
                <li
                  key={tab.id}
                  className="flex items-center justify-between gap-2 bg-elevated border border-[var(--border-default)] rounded-brutal px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs truncate">{tab.name}</p>
                    <p className="font-mono text-[10px] text-text-muted truncate">{tab.sessionId.slice(0, 8)}…</p>
                  </div>
                  <Button variant="ghost" className="shrink-0 py-1 px-2" onClick={() => openTerminalTab(tab.id)}>
                    Open
                  </Button>
                </li>
              ))}
              {tabs.length === 0 &&
                backendSessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 bg-elevated border border-[var(--border-default)] rounded-brutal px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-term-cyan truncate">{s.conn_id.slice(0, 12)}…</p>
                      <p className="font-mono text-[10px] text-text-muted">Backend session</p>
                    </div>
                    <Button variant="ghost" className="shrink-0 py-1 px-2" onClick={() => navigate('/terminal')}>
                      Reconnect
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard
          title="Recent Connections"
          delay={0.25}
          action={
            <button
              type="button"
              onClick={() => navigate('/connections')}
              className="font-mono text-[10px] text-purple-bright hover:underline uppercase"
            >
              Manage
            </button>
          }
        >
          {recentConnections.length === 0 ? (
            <p className="font-mono text-xs text-text-muted">
              No connections yet.{' '}
              <button type="button" className="text-purple-bright underline" onClick={() => navigate('/connections')}>
                Add one
              </button>
            </p>
          ) : (
            <ul className="space-y-2">
              {recentConnections.map((conn) => (
                <li
                  key={conn.id}
                  className="flex items-center justify-between gap-2 bg-elevated border border-[var(--border-default)] rounded-brutal px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs truncate">{conn.name}</p>
                    <p className="font-mono text-[10px] text-term-cyan truncate">
                      {conn.username}@{conn.host}:{conn.port}
                    </p>
                  </div>
                  <Button
                    variant={activeConnIds[conn.id] ? 'ghost' : 'primary'}
                    className="shrink-0 py-1 px-2"
                    onClick={() =>
                      activeConnIds[conn.id] ? navigate('/terminal') : handleQuickConnect(conn.id)
                    }
                  >
                    {activeConnIds[conn.id] ? 'Open' : 'Connect'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard
          title="Running Proxies"
          delay={0.3}
          action={
            <button
              type="button"
              onClick={() => navigate('/proxy')}
              className="font-mono text-[10px] text-purple-bright hover:underline uppercase inline-flex items-center gap-1"
            >
              Proxy <ArrowRight size={10} />
            </button>
          }
        >
          {runningTunnels.length === 0 ? (
            <p className="font-mono text-xs text-text-muted">
              No active tunnels.{' '}
              <button type="button" className="text-purple-bright underline" onClick={() => navigate('/proxy')}>
                Configure proxy
              </button>
            </p>
          ) : (
            <ul className="space-y-2">
              {runningTunnels.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 bg-elevated border border-[var(--border-default)] rounded-brutal px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs truncate flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-term-green animate-[status-online_2s_ease-in-out_infinite]" />
                      {t.name}
                    </p>
                    <p className="font-mono text-[10px] text-term-cyan">
                      {t.type.toUpperCase()} · {t.local_host}:{t.local_port}
                    </p>
                  </div>
                  <Badge color="green">RUN</Badge>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard title="System Status" delay={0.35}>
          <dl className="space-y-3 font-mono text-xs">
            <div className="flex justify-between gap-4 border-b border-[var(--border-default)] pb-2">
              <dt className="text-text-muted flex items-center gap-2">
                <Shield size={12} /> Version
              </dt>
              <dd className="text-purple-bright">{status?.version ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-[var(--border-default)] pb-2">
              <dt className="text-text-muted flex items-center gap-2">
                <Activity size={12} /> Server time
              </dt>
              <dd className="text-text-secondary">{status ? formatServerTime(status.uptime) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-[var(--border-default)] pb-2">
              <dt className="text-text-muted">Active conns</dt>
              <dd className="text-term-cyan tabular-nums">{status?.connections ?? Object.keys(activeConnIds).length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Backend sessions</dt>
              <dd className="text-term-green tabular-nums">{status?.sessions ?? backendSessions.length}</dd>
            </div>
          </dl>
        </DashboardCard>

        <DashboardCard
          title="Activity Feed"
          className="lg:col-span-2"
          delay={0.4}
          action={
            <button
              type="button"
              onClick={() => useLogStore.getState().toggleExpanded()}
              className="font-mono text-[10px] text-purple-bright hover:underline uppercase"
            >
              Expand logs
            </button>
          }
        >
          {activityFeed.length === 0 ? (
            <p className="font-mono text-xs text-text-muted">No recent activity — operations will appear here.</p>
          ) : (
            <ul className="space-y-1.5">
              {activityFeed.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start gap-2 font-mono text-[11px] py-1 border-l-2 border-purple-core/20 pl-2 hover:border-purple-core/50 transition-colors"
                >
                  <span className="text-text-muted shrink-0 tabular-nums">{formatTime(entry.timestamp)}</span>
                  <span
                    className={
                      entry.type === 'in'
                        ? 'text-term-cyan shrink-0 uppercase w-8'
                        : entry.type === 'out'
                          ? 'text-purple-bright shrink-0 uppercase w-8'
                          : 'text-term-green shrink-0 uppercase w-8'
                    }
                  >
                    {entry.type}
                  </span>
                  <span className="text-text-secondary truncate">{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}
