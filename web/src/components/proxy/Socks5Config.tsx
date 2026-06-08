import { useState } from 'react'
import { Input } from '@/components/shared/Input'
import { Button } from '@/components/shared/Button'
import { Connection } from '@/api/connections'
import { ApiError } from '@/api/client'

interface Socks5ConfigProps {
  connections: Connection[]
  onSubmit: (data: {
    name: string
    connection_id: string
    local_port: number
  }) => Promise<void>
  onCancel: () => void
}

export function Socks5Config({ connections, onSubmit, onCancel }: Socks5ConfigProps) {
  const [name, setName] = useState('')
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '')
  const [localPort, setLocalPort] = useState('1080')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        connection_id: connectionId,
        local_port: parseInt(localPort, 10) || 1080,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-mono text-[10px] uppercase text-text-muted mb-1">
          Name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dev SOCKS5"
          required
        />
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase text-text-muted mb-1">
          SSH Connection
        </label>
        <select
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          className="w-full bg-transparent border-b border-[var(--border-default)] px-1 py-2 font-mono text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-core"
          required
        >
          {connections.map((c) => (
            <option key={c.id} value={c.id} className="bg-elevated">
              {c.name} ({c.username}@{c.host})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase text-text-muted mb-1">
          Local Port
        </label>
        <Input
          type="number"
          min={1}
          max={65535}
          value={localPort}
          onChange={(e) => setLocalPort(e.target.value)}
          placeholder="1080"
          required
        />
        <p className="mt-1 font-mono text-[10px] text-text-muted">
          Binds to 127.0.0.1 — connect apps to socks5://127.0.0.1:{localPort || '1080'}
        </p>
      </div>
      {error && (
        <p className="font-mono text-xs text-term-red border-l-2 border-term-red pl-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || connections.length === 0}>
          {submitting ? 'Creating…' : 'Create SOCKS5'}
        </Button>
      </div>
    </form>
  )
}
