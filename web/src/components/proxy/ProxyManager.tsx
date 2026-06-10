import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Play, Square, Trash2, Plus } from 'lucide-react'
import { useTunnelStore } from '@/store/tunnelStore'
import { useConnectionStore } from '@/store/connectionStore'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { Modal } from '@/components/shared/Modal'
import { Socks5Config } from '@/components/proxy/Socks5Config'
import { PortForwardList } from '@/components/proxy/PortForwardList'
import { ConnectionGraph } from '@/components/proxy/ConnectionGraph'
import { RouteTrace } from '@/components/proxy/RouteTrace'
import { ApiError } from '@/api/client'

type GraphTab = 'topology' | 'trace'

function statusColor(status: string): 'green' | 'red' | 'purple' | 'amber' {
  if (status === 'running') return 'green'
  if (status === 'error') return 'red'
  return 'purple'
}

export function ProxyManager() {
  const {
    tunnels,
    stats,
    loading,
    error,
    fetch,
    create,
    remove,
    start,
    stop,
    clearError,
  } = useTunnelStore()
  const { connections, fetch: fetchConnections } = useConnectionStore()
  const [socksModal, setSocksModal] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [graphTab, setGraphTab] = useState<GraphTab>('topology')

  useEffect(() => {
    fetch()
    fetchConnections()
  }, [fetch, fetchConnections])

  useEffect(() => {
    const running = tunnels.filter((t) => t.status === 'running')
    if (running.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !running.some((t) => t.id === selectedId)) {
      const firstSocks = running.find((t) => t.type === 'socks5' || t.type === 'dynamic')
      setSelectedId(firstSocks?.id ?? running[0].id)
    }
    // Live stats arrive via /ws/tunnels; REST fetchStats remains for manual refresh after actions.
  }, [tunnels, selectedId])

  const socks5Tunnels = tunnels.filter((t) => t.type === 'socks5' || t.type === 'dynamic')
  const connName = (id: string) => connections.find((c) => c.id === id)?.name ?? id.slice(0, 8)
  const selectedTunnel = socks5Tunnels.find((t) => t.id === selectedId)
  const selectedStats = selectedId ? stats[selectedId] : undefined
  const selectedConnection = selectedTunnel
    ? connections.find((c) => c.id === selectedTunnel.connection_id)
    : undefined

  const run = async (tunnelId: string, fn: (id: string) => Promise<void>) => {
    setBusy(tunnelId)
    setActionError(null)
    try {
      await fn(tunnelId)
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const handleCreateSocks5 = async (data: {
    name: string
    connection_id: string
    local_port: number
  }) => {
    await create({
      ...data,
      type: 'socks5',
      local_host: '127.0.0.1',
    })
    setSocksModal(false)
  }

  const hasActiveConnections =
    (selectedStats?.connections?.length ?? 0) > 0

  return (
    <div className="flex flex-col min-h-full">
      <div className="shrink-0 p-6 pb-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-lg text-purple-bright mb-1">Proxy & Tunnels</h2>
          <p className="font-mono text-xs text-text-muted">
            SOCKS5 proxies and SSH port forwards through your connections
          </p>
        </div>
        <Button onClick={() => setSocksModal(true)}>
          <Plus size={14} className="inline mr-1" /> New SOCKS5
        </Button>
      </div>

      {(error || actionError) && (
        <div className="mb-4 p-3 border border-term-red/40 rounded-brutal bg-term-red/5 flex items-start justify-between">
          <p className="font-mono text-xs text-term-red">{error || actionError}</p>
          <button
            onClick={() => {
              clearError()
              setActionError(null)
            }}
            className="font-mono text-[10px] text-text-muted hover:text-purple-bright ml-4"
          >
            dismiss
          </button>
        </div>
      )}

      <section className="mb-8">
        <h3 className="font-display text-sm text-purple-bright mb-4">SOCKS5 Proxies</h3>
        {loading && tunnels.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">Loading tunnels…</p>
        ) : socks5Tunnels.length === 0 ? (
          <div className="p-6 border border-dashed border-purple-core/30 rounded-brutal text-center">
            <p className="font-mono text-xs text-text-muted mb-3">
              No SOCKS5 proxies yet. Create one to route traffic through an SSH tunnel.
            </p>
            <Button variant="ghost" onClick={() => setSocksModal(true)}>
              Create SOCKS5 Proxy
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {socks5Tunnels.map((t) => {
              const s = stats[t.id]
              const selected = selectedId === t.id
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => t.status === 'running' && setSelectedId(t.id)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && t.status === 'running') {
                      setSelectedId(t.id)
                    }
                  }}
                  className={clsx(
                    'flex items-center gap-3 p-4 bg-surface border rounded-brutal border-l-[3px] transition-colors cursor-pointer',
                    selected
                      ? 'border-purple-core/60 border-l-purple-bright bg-active/40'
                      : 'border-[var(--border-default)] border-l-purple-core hover:bg-hover/30',
                    t.status !== 'running' && 'card-disconnected-glitch',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-[var(--text-primary)]">
                        {t.name}
                      </span>
                      <Badge color={statusColor(t.status)}>{t.status}</Badge>
                      <Badge color="purple">socks5</Badge>
                    </div>
                    <p className="font-mono text-[10px] text-text-muted">
                      {connName(t.connection_id)} · 127.0.0.1:{t.local_port}
                    </p>
                    {t.status === 'running' && (
                      <p className="font-mono text-[10px] text-term-green mt-1">
                        {s
                          ? `${s.active_connections} active / ${s.total_connections} total connections`
                          : 'Listening — use socks5://127.0.0.1:' + t.local_port}
                      </p>
                    )}
                    {t.error_message && (
                      <p className="font-mono text-[10px] text-term-red mt-1">
                        {t.error_message}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {t.status === 'running' ? (
                      <Button
                        variant="ghost"
                        disabled={busy === t.id}
                        onClick={() => run(t.id, stop)}
                        title="Stop"
                      >
                        <Square size={14} />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        disabled={busy === t.id}
                        onClick={() => run(t.id, start)}
                        title="Start"
                      >
                        <Play size={14} />
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      disabled={busy === t.id || t.status === 'running'}
                      onClick={() => run(t.id, remove)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
      </div>

      <div className="flex flex-col flex-1 min-h-0 px-6">
        {selectedTunnel?.status === 'running' && (
          <section
            className={clsx(
              'flex flex-col border-t border-[var(--border-default)] pt-4',
              hasActiveConnections
                ? 'flex-1 min-h-[min(520px,58vh)]'
                : 'shrink-0 min-h-[min(480px,52vh)]',
            )}
          >
            <div className="shrink-0 flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-sm text-purple-bright">Connection Graph</h3>
                <p className="font-mono text-[10px] text-text-muted mt-1">
                  {selectedTunnel.name} · {selectedStats?.bind_addr ?? `127.0.0.1:${selectedTunnel.local_port}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  <GraphTabToggle
                    label="Proxy Topology"
                    active={graphTab === 'topology'}
                    onClick={() => setGraphTab('topology')}
                  />
                  <GraphTabToggle
                    label="Route Trace"
                    active={graphTab === 'trace'}
                    onClick={() => setGraphTab('trace')}
                  />
                </div>
                {graphTab === 'topology' && selectedStats && (
                  <p className="font-mono text-[10px] text-term-green">
                    {selectedStats.active_connections} active / {selectedStats.total_connections} routed
                  </p>
                )}
              </div>
            </div>
            <div
              className={clsx(
                'flex flex-col min-h-0',
                graphTab === 'topology' && hasActiveConnections
                  ? 'flex-[3] min-h-[min(400px,45vh)]'
                  : graphTab === 'topology'
                    ? 'flex-1 min-h-[min(400px,45vh)]'
                    : 'shrink-0',
              )}
            >
              {graphTab === 'topology' ? (
                <ConnectionGraph
                  graph={selectedStats?.graph}
                  bindAddr={selectedStats?.bind_addr ?? `127.0.0.1:${selectedTunnel.local_port}`}
                  connections={selectedStats?.connections}
                  empty={!selectedStats?.graph?.edges?.length}
                />
              ) : (
                <RouteTrace
                  connection={selectedConnection}
                  defaultHost={selectedConnection?.host}
                />
              )}
            </div>
            {hasActiveConnections && (
              <div className="flex flex-col flex-[2] min-h-[200px] max-h-[min(320px,40vh)] lg:max-h-none mt-4 overflow-hidden">
                <p className="shrink-0 font-mono text-[10px] text-text-muted mb-2 uppercase tracking-wider">
                  Active connections ({selectedStats!.connections!.length})
                </p>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-brutal border border-[var(--border-default)] bg-surface/40">
                  <table className="w-full font-mono text-[10px] border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="text-text-muted text-left border-b border-[var(--border-default)] bg-surface">
                        <th className="py-1 px-3 bg-surface">Source</th>
                        <th className="py-1 px-3 bg-surface">Destination</th>
                        <th className="py-1 px-3 bg-surface">Since</th>
                        <th className="py-1 px-3 bg-surface">Bytes in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStats!.connections!.map((c) => (
                        <tr
                          key={c.id}
                          className="border-b border-[var(--border-default)]/40 text-text-secondary hover:bg-hover/30"
                        >
                          <td className="py-1 px-3 text-term-cyan whitespace-nowrap">{c.source}</td>
                          <td className="py-1 px-3 whitespace-nowrap">{c.destination}</td>
                          <td className="py-1 px-3 text-text-muted whitespace-nowrap">
                            {new Date(c.started_at).toLocaleTimeString()}
                          </td>
                          <td className="py-1 px-3 whitespace-nowrap">{formatBytes(c.bytes_in)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        <section
          className={clsx(
            'shrink-0 border-t border-[var(--border-default)] pt-4 pb-6',
            selectedTunnel?.status === 'running' && 'lg:max-h-[35%] lg:overflow-y-auto',
          )}
        >
          <PortForwardList
            tunnels={tunnels}
            connections={connections}
            stats={stats}
            onStart={start}
            onStop={stop}
            onDelete={remove}
            onCreate={async (data) => {
              await create(data)
            }}
          />
        </section>
      </div>

      <Modal open={socksModal} onClose={() => setSocksModal(false)} title="New SOCKS5 Proxy">
        {connections.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">
            Add an SSH connection first, then create a SOCKS5 proxy.
          </p>
        ) : (
          <Socks5Config
            key={socks5Tunnels.map((t) => `${t.id}:${t.local_port}`).join('|') || 'new'}
            connections={connections}
            existingTunnels={tunnels}
            onSubmit={handleCreateSocks5}
            onCancel={() => setSocksModal(false)}
          />
        )}
      </Modal>
    </div>
  )
}

function GraphTabToggle({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'px-1.5 py-0.5 font-mono text-[10px] uppercase rounded-brutal border transition-colors',
        active
          ? 'border-purple-core text-purple-bright bg-purple-dim/30'
          : 'border-transparent text-text-muted hover:text-text-secondary hover:border-[var(--border-hover)]',
      )}
    >
      {label}
    </button>
  )
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
