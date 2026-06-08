import { useState } from 'react'
import { Play, Square, Trash2, Plus } from 'lucide-react'
import { Tunnel, TunnelStats } from '@/api/tunnels'
import { Connection } from '@/api/connections'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { Modal } from '@/components/shared/Modal'
import { Input } from '@/components/shared/Input'
import { ApiError } from '@/api/client'

interface PortForwardListProps {
  tunnels: Tunnel[]
  connections: Connection[]
  stats: Record<string, TunnelStats>
  onStart: (id: string) => Promise<void>
  onStop: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreate: (data: Partial<Tunnel>) => Promise<void>
}

function statusColor(status: string): 'green' | 'red' | 'purple' | 'amber' {
  if (status === 'running') return 'green'
  if (status === 'error') return 'red'
  return 'purple'
}

function tunnelEndpoint(t: Tunnel): string {
  if (t.type === 'socks5' || t.type === 'dynamic') {
    return `127.0.0.1:${t.local_port}`
  }
  return `${t.local_host || '127.0.0.1'}:${t.local_port} → ${t.remote_host}:${t.remote_port}`
}

export function PortForwardList({
  tunnels,
  connections,
  stats,
  onStart,
  onStop,
  onDelete,
  onCreate,
}: PortForwardListProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '')
  const [localPort, setLocalPort] = useState('8080')
  const [remoteHost, setRemoteHost] = useState('127.0.0.1')
  const [remotePort, setRemotePort] = useState('80')

  const connName = (id: string) => connections.find((c) => c.id === id)?.name ?? id.slice(0, 8)

  const run = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id)
    setError(null)
    try {
      await fn(id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const handleCreateForward = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await onCreate({
        name: name.trim(),
        connection_id: connectionId,
        type: 'local',
        local_host: '127.0.0.1',
        local_port: parseInt(localPort, 10) || 8080,
        remote_host: remoteHost.trim(),
        remote_port: parseInt(remotePort, 10) || 80,
      })
      setModalOpen(false)
      setName('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message)
    }
  }

  const localForwards = tunnels.filter((t) => t.type === 'local')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm text-purple-bright">Local Port Forwards</h3>
        <Button variant="ghost" onClick={() => setModalOpen(true)}>
          <Plus size={14} className="inline mr-1" /> Add Forward
        </Button>
      </div>

      {error && (
        <p className="mb-3 font-mono text-xs text-term-red border-l-2 border-term-red pl-2">
          {error}
        </p>
      )}

      {localForwards.length === 0 ? (
        <p className="font-mono text-xs text-text-muted py-4">
          No local port forwards configured.
        </p>
      ) : (
        <div className="space-y-2">
          {localForwards.map((t) => {
            const s = stats[t.id]
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 p-3 bg-surface border border-[var(--border-default)] rounded-brutal border-l-[3px] border-l-purple-core/60"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm text-[var(--text-primary)] truncate">
                      {t.name}
                    </span>
                    <Badge color={statusColor(t.status)}>{t.status}</Badge>
                  </div>
                  <p className="font-mono text-[10px] text-text-muted truncate">
                    {connName(t.connection_id)} · {tunnelEndpoint(t)}
                  </p>
                  {t.status === 'running' && s && (
                    <p className="font-mono text-[10px] text-term-green mt-1">
                      {s.active_connections} active / {s.total_connections} total
                    </p>
                  )}
                  {t.error_message && (
                    <p className="font-mono text-[10px] text-term-red mt-1">{t.error_message}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {t.status === 'running' ? (
                    <Button
                      variant="ghost"
                      disabled={busy === t.id}
                      onClick={() => run(t.id, onStop)}
                      title="Stop"
                    >
                      <Square size={14} />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={busy === t.id}
                      onClick={() => run(t.id, onStart)}
                      title="Start"
                    >
                      <Play size={14} />
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    disabled={busy === t.id || t.status === 'running'}
                    onClick={() => run(t.id, onDelete)}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Local Port Forward">
        <form onSubmit={handleCreateForward} className="space-y-4">
          <div>
            <label className="block font-mono text-[10px] uppercase text-text-muted mb-1">
              Name
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase text-text-muted mb-1">
              SSH Connection
            </label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="w-full bg-transparent border-b border-[var(--border-default)] px-1 py-2 font-mono text-sm focus:outline-none focus:border-purple-core"
              required
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id} className="bg-elevated">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-text-muted mb-1">
                Local Port
              </label>
              <Input
                type="number"
                value={localPort}
                onChange={(e) => setLocalPort(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-text-muted mb-1">
                Remote Port
              </label>
              <Input
                type="number"
                value={remotePort}
                onChange={(e) => setRemotePort(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase text-text-muted mb-1">
              Remote Host
            </label>
            <Input
              value={remoteHost}
              onChange={(e) => setRemoteHost(e.target.value)}
              placeholder="127.0.0.1 or db.internal"
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Forward</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
