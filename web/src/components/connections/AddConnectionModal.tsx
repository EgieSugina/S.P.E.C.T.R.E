import { useEffect, useState } from 'react'
import { Modal } from '@/components/shared/Modal'
import { Input } from '@/components/shared/Input'
import { Button } from '@/components/shared/Button'
import { connectionsApi } from '@/api/connections'
import { tunnelsApi, Tunnel } from '@/api/tunnels'
import { proxyChainsApi, ProxyChain } from '@/api/proxyChains'
import {
  ProxyFormValue,
  ProxySelector,
  proxyPayloadFromForm,
} from '@/components/connections/ProxySelector'
import { useSettingsStore } from '@/store/settingsStore'
import { useKeyStore } from '@/store/keyStore'
import { useGroupStore } from '@/store/groupStore'
import { ApiError } from '@/api/client'

interface AddConnectionModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function AddConnectionModal({ open, onClose, onCreated }: AddConnectionModalProps) {
  const { vaultLocked, vaultConfigured, fetch: fetchSettings, openVaultModal } = useSettingsStore()
  const { keys, fetch: fetchKeys } = useKeyStore()
  const { groups, fetch: fetchGroups } = useGroupStore()
  const [form, setForm] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    auth_type: 'password',
    private_key_id: '',
    group_id: '',
    notes: '',
  })
  const [proxy, setProxy] = useState<ProxyFormValue>({
    mode: 'none',
    proxy_tunnel_id: '',
    proxy_chain_id: '',
    proxy_host: '',
    proxy_port: 1080,
  })
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [chains, setChains] = useState<ProxyChain[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      fetchSettings()
      fetchKeys()
      fetchGroups()
      tunnelsApi.list().then(setTunnels).catch(() => setTunnels([]))
      proxyChainsApi.list().then(setChains).catch(() => setChains([]))
    }
  }, [open, fetchSettings, fetchKeys, fetchGroups])

  const vaultBlocked = vaultLocked || !vaultConfigured
  const usesKey = form.auth_type === 'key'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (vaultBlocked) {
      openVaultModal()
      return
    }
    if (usesKey && !form.private_key_id) {
      setError('Select an SSH key')
      return
    }
    if (!usesKey && !form.password) {
      setError('Password is required')
      return
    }
    if (proxy.mode === 'tunnel' && !proxy.proxy_tunnel_id) {
      setError('Select a proxy tunnel')
      return
    }
    if (proxy.mode === 'chain' && !proxy.proxy_chain_id) {
      setError('Select a proxy chain')
      return
    }
    if (proxy.mode === 'manual' && (!proxy.proxy_host || proxy.proxy_port <= 0)) {
      setError('Proxy host and port are required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await connectionsApi.create({
        ...form,
        ...proxyPayloadFromForm(proxy),
        private_key_id: usesKey ? form.private_key_id : undefined,
        password: usesKey ? undefined : form.password,
        group_id: form.group_id || undefined,
      })
      onCreated()
      onClose()
      setForm({
        name: '',
        host: '',
        port: 22,
        username: '',
        password: '',
        auth_type: 'password',
        private_key_id: '',
        group_id: '',
        notes: '',
      })
      setProxy({ mode: 'none', proxy_tunnel_id: '', proxy_chain_id: '', proxy_host: '', proxy_port: 1080 })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`[${err.code}] ${err.message}`)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Connection">
      <form onSubmit={handleSubmit} className="space-y-4">
        {vaultBlocked && (
          <p className="text-amber-200 font-mono text-xs border border-amber-500/40 bg-amber-500/10 rounded-brutal px-3 py-2">
            {vaultConfigured
              ? 'Vault is locked. Submit or connect to unlock and save credentials.'
              : 'Set up the security vault to encrypt and save SSH credentials.'}
          </p>
        )}
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Name</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="font-mono text-[10px] text-text-muted uppercase">Host</label>
            <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
          </div>
          <div>
            <label className="font-mono text-[10px] text-text-muted uppercase">Port</label>
            <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: +e.target.value })} />
          </div>
        </div>
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Username</label>
          <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        </div>
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Authentication</label>
          <select
            value={form.auth_type}
            onChange={(e) => setForm({ ...form, auth_type: e.target.value })}
            className="w-full mt-1 bg-deep border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-purple-core/60 focus:outline-none"
          >
            <option value="password">Password</option>
            <option value="key">SSH Key</option>
          </select>
        </div>
        {usesKey ? (
          <div>
            <label className="font-mono text-[10px] text-text-muted uppercase">SSH Key</label>
            {keys.length === 0 ? (
              <p className="font-mono text-xs text-text-muted mt-1">
                No keys available. Generate or import one in the Keys page.
              </p>
            ) : (
              <select
                value={form.private_key_id}
                onChange={(e) => setForm({ ...form, private_key_id: e.target.value })}
                required
                className="w-full mt-1 bg-deep border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-purple-core/60 focus:outline-none"
              >
                <option value="">Select key...</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.fingerprint.slice(0, 16)}…)
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div>
            <label className="font-mono text-[10px] text-text-muted uppercase">Password</label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
        )}
        <ProxySelector value={proxy} onChange={setProxy} tunnels={tunnels} chains={chains} />
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Group</label>
          <select
            value={form.group_id}
            onChange={(e) => setForm({ ...form, group_id: e.target.value })}
            className="w-full mt-1 bg-deep border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-purple-core/60 focus:outline-none"
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Notes</label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {error && <p className="text-term-red font-mono text-xs">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  )
}
