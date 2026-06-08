import { useEffect, useState } from 'react'
import { Modal } from '@/components/shared/Modal'
import { Input } from '@/components/shared/Input'
import { Button } from '@/components/shared/Button'
import { connectionsApi } from '@/api/connections'
import { useSettingsStore } from '@/store/settingsStore'
import { ApiError } from '@/api/client'

interface AddConnectionModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function AddConnectionModal({ open, onClose, onCreated }: AddConnectionModalProps) {
  const { vaultLocked, vaultConfigured, fetch: fetchSettings, openVaultModal } = useSettingsStore()
  const [form, setForm] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    auth_type: 'password',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      fetchSettings()
    }
  }, [open, fetchSettings])

  const vaultBlocked = vaultLocked || !vaultConfigured

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (vaultBlocked) {
      openVaultModal()
      return
    }
    if (form.auth_type === 'password' && !form.password) {
      setError('Password is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await connectionsApi.create(form)
      onCreated()
      onClose()
      setForm({ name: '', host: '', port: 22, username: '', password: '', auth_type: 'password', notes: '' })
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
          <label className="font-mono text-[10px] text-text-muted uppercase">Password</label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={form.auth_type === 'password'}
          />
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
