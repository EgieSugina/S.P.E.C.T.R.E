import { useEffect, useState } from 'react'
import { Copy, Download, KeyRound, Plus, Trash2, Upload } from 'lucide-react'
import { useKeyStore } from '@/store/keyStore'
import { useSettingsStore } from '@/store/settingsStore'
import { KeyType, keysApi } from '@/api/keys'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { Modal } from '@/components/shared/Modal'
import { Input } from '@/components/shared/Input'
import { ApiError } from '@/api/client'

const KEY_TYPES: { value: KeyType; label: string }[] = [
  { value: 'ed25519', label: 'Ed25519 (recommended)' },
  { value: 'rsa4096', label: 'RSA 4096' },
  { value: 'rsa2048', label: 'RSA 2048' },
]

function formatKeyType(t: string) {
  switch (t) {
    case 'ed25519':
      return 'Ed25519'
    case 'rsa2048':
      return 'RSA 2048'
    case 'rsa4096':
      return 'RSA 4096'
    default:
      return t.toUpperCase()
  }
}

function GenerateKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { generate } = useKeyStore()
  const { vaultLocked, vaultConfigured, openVaultModal } = useSettingsStore()
  const [name, setName] = useState('')
  const [type, setType] = useState<KeyType>('ed25519')
  const [passphrase, setPassphrase] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const vaultBlocked = vaultLocked || !vaultConfigured

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (vaultBlocked) {
      openVaultModal()
      return
    }
    setLoading(true)
    setError('')
    try {
      await generate(name, type, passphrase || undefined)
      onCreated()
      onClose()
      setName('')
      setPassphrase('')
      setType('ed25519')
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
    <Modal open={open} onClose={onClose} title="Generate Keypair">
      <form onSubmit={handleSubmit} className="space-y-4">
        {vaultBlocked && (
          <p className="text-amber-200 font-mono text-xs border border-amber-500/40 bg-amber-500/10 rounded-brutal px-3 py-2">
            Unlock the vault to generate and store private keys.
          </p>
        )}
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="deploy-key" />
        </div>
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as KeyType)}
            className="w-full mt-1 bg-deep border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-purple-core/60 focus:outline-none"
          >
            {KEY_TYPES.map((kt) => (
              <option key={kt.value} value={kt.value}>
                {kt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Key Passphrase (optional)</label>
          <Input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Encrypts PEM on export"
          />
        </div>
        {error && <p className="text-term-red font-mono text-xs">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ImportKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { importKey } = useKeyStore()
  const { vaultLocked, vaultConfigured, openVaultModal } = useSettingsStore()
  const [name, setName] = useState('')
  const [pem, setPem] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const vaultBlocked = vaultLocked || !vaultConfigured

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setPem(text)
    if (!name) {
      setName(file.name.replace(/\.(pem|key)$/i, ''))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (vaultBlocked) {
      openVaultModal()
      return
    }
    setLoading(true)
    setError('')
    try {
      await importKey(name, pem, passphrase || undefined)
      onCreated()
      onClose()
      setName('')
      setPem('')
      setPassphrase('')
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
    <Modal open={open} onClose={onClose} title="Import Private Key">
      <form onSubmit={handleSubmit} className="space-y-4">
        {vaultBlocked && (
          <p className="text-amber-200 font-mono text-xs border border-amber-500/40 bg-amber-500/10 rounded-brutal px-3 py-2">
            Unlock the vault to import and store private keys.
          </p>
        )}
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">PEM File</label>
          <input
            type="file"
            accept=".pem,.key,text/plain"
            onChange={handleFile}
            className="block w-full mt-1 font-mono text-xs text-text-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-brutal file:border file:border-purple-core/40 file:bg-purple-core/10 file:text-purple-bright file:font-mono file:text-[10px] file:uppercase"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">PEM Content</label>
          <textarea
            value={pem}
            onChange={(e) => setPem(e.target.value)}
            required
            rows={6}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            className="w-full mt-1 bg-deep border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-purple-core/60 focus:outline-none resize-y"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Key Passphrase (if encrypted)</label>
          <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </div>
        {error && <p className="text-term-red font-mono text-xs">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function KeyManager() {
  const { keys, loading, error, fetch, remove, clearError } = useKeyStore()
  const { vaultLocked, vaultConfigured, fetch: fetchSettings, openVaultModal } = useSettingsStore()
  const [generateOpen, setGenerateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    fetch()
    fetchSettings()
  }, [fetch, fetchSettings])

  const copyPublicKey = async (key: (typeof keys)[0]) => {
    try {
      await navigator.clipboard.writeText(key.public_key.trim())
      setCopiedId(key.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setActionError('Failed to copy to clipboard')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete key "${name}"?`)) return
    clearError()
    setActionError('')
    try {
      await remove(id)
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(`[${err.code}] ${err.message}`)
      }
    }
  }

  const vaultBlocked = vaultLocked || !vaultConfigured

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-purple-bright text-lg">SSH Keys</h2>
          <p className="font-mono text-xs text-text-muted mt-1">
            {keys.length} keypair(s) · vault-encrypted at rest
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => (vaultBlocked ? openVaultModal() : setImportOpen(true))}>
            <Upload size={14} className="inline mr-1" /> Import
          </Button>
          <Button onClick={() => (vaultBlocked ? openVaultModal() : setGenerateOpen(true))}>
            <Plus size={14} className="inline mr-1" /> Generate
          </Button>
        </div>
      </div>

      {vaultBlocked && (
        <div
          className="mb-4 border border-amber-500/40 bg-amber-500/10 rounded-brutal px-4 py-3 font-mono text-xs text-amber-200"
          role="status"
        >
          {vaultConfigured
            ? 'Vault is locked. Unlock to generate or import keys.'
            : 'Configure the security vault in Settings before managing keys.'}
        </div>
      )}

      {(error || actionError) && (
        <div
          className="mb-4 border border-term-red/40 bg-term-red/10 rounded-brutal px-4 py-3 font-mono text-xs text-term-red"
          role="alert"
        >
          {error || actionError}
        </div>
      )}

      {loading && keys.length === 0 ? (
        <p className="font-mono text-sm text-text-muted text-center py-16">Loading keys...</p>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--border-default)] rounded-brutal">
          <KeyRound size={32} className="mx-auto text-purple-core/40 mb-3" />
          <p className="font-mono text-sm text-text-muted">No SSH keys stored.</p>
          <p className="font-mono text-xs text-text-muted mt-1">Generate or import a keypair to use key-based auth.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {keys.map((key) => (
            <div
              key={key.id}
              className="bg-surface border border-[var(--border-default)] border-l-[3px] border-l-purple-core rounded-brutal p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-mono text-sm text-[var(--text-primary)]">{key.name}</h3>
                  <p className="font-mono text-[10px] text-text-muted mt-1 tabular-nums">{key.fingerprint}</p>
                </div>
                <Badge color="purple">{formatKeyType(key.type)}</Badge>
              </div>
              <pre className="font-mono text-[10px] text-term-cyan bg-deep/60 border border-[var(--border-default)] rounded-brutal p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-16">
                {key.public_key.trim()}
              </pre>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button variant="ghost" onClick={() => copyPublicKey(key)}>
                  <Copy size={12} className="inline mr-1" />
                  {copiedId === key.id ? 'Copied!' : 'Copy .pub'}
                </Button>
                <Button variant="ghost" onClick={() => keysApi.downloadPublic(key.id, key.name)}>
                  <Download size={12} className="inline mr-1" /> Download
                </Button>
                <Button variant="danger" onClick={() => handleDelete(key.id, key.name)}>
                  <Trash2 size={12} className="inline mr-1" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <GenerateKeyModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onCreated={fetch}
      />
      <ImportKeyModal open={importOpen} onClose={() => setImportOpen(false)} onCreated={fetch} />
    </div>
  )
}
