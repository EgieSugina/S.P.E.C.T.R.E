import { useEffect, useState } from 'react'
import { Link2, Plus, Trash2 } from 'lucide-react'
import { ProxyChain, ProxyChainHop, proxyChainsApi } from '@/api/proxyChains'
import { Tunnel } from '@/api/tunnels'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Modal } from '@/components/shared/Modal'
import { ApiError } from '@/api/client'

interface ChainProxyListProps {
  tunnels: Tunnel[]
  connName: (id: string) => string
}

const emptyHop = (): ProxyChainHop => ({ type: 'tunnel', tunnel_id: '' })

export function ChainProxyList({ tunnels, connName }: ChainProxyListProps) {
  const [chains, setChains] = useState<ProxyChain[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [hops, setHops] = useState<ProxyChainHop[]>([emptyHop(), emptyHop()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const socksTunnels = tunnels.filter((t) => t.type === 'socks5' || t.type === 'dynamic')

  const load = () => {
    setLoading(true)
    proxyChainsApi
      .list()
      .then(setChains)
      .catch(() => setChains([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const hopLabel = (hop: ProxyChainHop) => {
    if (hop.type === 'tunnel') {
      const t = socksTunnels.find((x) => x.id === hop.tunnel_id)
      if (t) return `${t.name} (${t.local_host}:${t.local_port})`
      return hop.tunnel_id?.slice(0, 8) ?? 'tunnel'
    }
    return `${hop.host}:${hop.port}`
  }

  const updateHop = (index: number, patch: Partial<ProxyChainHop>) => {
    setHops((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await proxyChainsApi.create({ name, hops })
      setModalOpen(false)
      setName('')
      setHops([emptyHop(), emptyHop()])
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await proxyChainsApi.delete(id)
      load()
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-sm text-purple-bright">Proxy Chains</h3>
          <p className="font-mono text-[10px] text-text-muted mt-1">
            Route SSH through multiple SOCKS5 hops (tunnel → tunnel → target)
          </p>
        </div>
        <Button variant="ghost" onClick={() => setModalOpen(true)}>
          <Plus size={14} className="inline mr-1" /> New Chain
        </Button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-text-muted">Loading chains…</p>
      ) : chains.length === 0 ? (
        <div className="p-6 border border-dashed border-purple-core/30 rounded-brutal text-center">
          <p className="font-mono text-xs text-text-muted mb-3">
            No proxy chains yet. Chain SOCKS5 tunnels or external proxies for multi-hop routing.
          </p>
          <Button variant="ghost" onClick={() => setModalOpen(true)}>
            Create Proxy Chain
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {chains.map((chain) => (
            <div
              key={chain.id}
              className="p-4 bg-surface border border-[var(--border-default)] border-l-[3px] border-l-purple-bright rounded-brutal"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 size={14} className="text-purple-bright shrink-0" />
                    <span className="font-mono text-sm text-[var(--text-primary)]">{chain.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] text-term-cyan">
                    {chain.hops.map((hop, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        {i > 0 && <span className="text-text-muted">→</span>}
                        <span className="px-1.5 py-0.5 bg-deep border border-[var(--border-default)] rounded-brutal">
                          {hopLabel(hop)}
                        </span>
                      </span>
                    ))}
                    <span className="text-text-muted">→</span>
                    <span className="text-text-muted">target</span>
                  </div>
                </div>
                <Button variant="danger" onClick={() => handleDelete(chain.id)} title="Delete">
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Proxy Chain">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="font-mono text-[10px] text-text-muted uppercase">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-3">
            <label className="font-mono text-[10px] text-text-muted uppercase">Hops (min 2)</label>
            {hops.map((hop, i) => (
              <div
                key={i}
                className="p-3 border border-[var(--border-default)] rounded-brutal bg-deep/50 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-purple-bright">Hop {i + 1}</span>
                  {hops.length > 2 && (
                    <button
                      type="button"
                      className="font-mono text-[10px] text-term-red hover:underline"
                      onClick={() => setHops((prev) => prev.filter((_, j) => j !== i))}
                    >
                      remove
                    </button>
                  )}
                </div>
                <select
                  value={hop.type}
                  onChange={(e) =>
                    updateHop(i, {
                      type: e.target.value as ProxyChainHop['type'],
                      tunnel_id: '',
                      host: '',
                      port: 1080,
                    })
                  }
                  className="w-full bg-deep border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs"
                >
                  <option value="tunnel">SPECTRE SOCKS5 tunnel</option>
                  <option value="socks5">External SOCKS5</option>
                </select>
                {hop.type === 'tunnel' ? (
                  <select
                    value={hop.tunnel_id ?? ''}
                    onChange={(e) => updateHop(i, { tunnel_id: e.target.value })}
                    required
                    className="w-full bg-deep border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs"
                  >
                    <option value="">Select tunnel…</option>
                    {socksTunnels.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {connName(t.connection_id)} ({t.status})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Input
                        value={hop.host ?? ''}
                        onChange={(e) => updateHop(i, { host: e.target.value })}
                        placeholder="Host"
                        required
                      />
                    </div>
                    <Input
                      type="number"
                      value={hop.port ?? 1080}
                      onChange={(e) => updateHop(i, { port: +e.target.value })}
                      required
                    />
                  </div>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setHops((prev) => [...prev, emptyHop()])}
            >
              <Plus size={12} className="inline mr-1" /> Add hop
            </Button>
          </div>
          {error && <p className="font-mono text-xs text-term-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
