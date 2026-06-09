import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { HostKeyMismatchDetails, knownHostsApi } from '@/api/knownHosts'
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/shared/Button'
import { ApiError } from '@/api/client'

interface HostKeyTrustModalProps {
  open: boolean
  details: HostKeyMismatchDetails | null
  onClose: () => void
  onTrusted: () => void
}

export function HostKeyTrustModal({ open, details, onClose, onTrusted }: HostKeyTrustModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!details) return null

  const handleTrust = async () => {
    setLoading(true)
    setError('')
    try {
      await knownHostsApi.trust({
        host: details.host,
        port: details.port,
        key_type: details.key_type,
        fingerprint: details.received_fingerprint,
        key_data: details.received_key,
      })
      onTrusted()
      onClose()
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
    <Modal open={open} onClose={onClose} title="Host Key Changed">
      <div className="space-y-4">
        <div className="flex items-start gap-3 border border-amber-500/40 bg-amber-500/10 rounded-brutal px-4 py-3">
          <ShieldAlert size={18} className="text-amber-200 shrink-0 mt-0.5" />
          <p className="font-mono text-xs text-amber-200 leading-relaxed">
            The host key for{' '}
            <span className="text-term-cyan">
              {details.host}:{details.port}
            </span>{' '}
            does not match the key stored from a previous connection. This may indicate a
            man-in-the-middle attack.
          </p>
        </div>

        <div className="space-y-2 font-mono text-[10px]">
          <div>
            <span className="text-text-muted uppercase">Stored fingerprint</span>
            <p className="text-term-green mt-0.5 break-all">{details.expected_fingerprint}</p>
          </div>
          <div>
            <span className="text-text-muted uppercase">Received fingerprint</span>
            <p className="text-term-red mt-0.5 break-all">{details.received_fingerprint}</p>
          </div>
        </div>

        {error && <p className="text-term-red font-mono text-xs">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={handleTrust} disabled={loading}>
            {loading ? 'Trusting...' : 'Trust New Key'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function parseHostKeyMismatch(err: unknown): HostKeyMismatchDetails | null {
  if (!(err instanceof ApiError) || err.code !== 'HOST_KEY_MISMATCH' || !err.details) {
    return null
  }
  const d = err.details
  if (
    typeof d.host !== 'string' ||
    typeof d.received_fingerprint !== 'string' ||
    typeof d.received_key !== 'string'
  ) {
    return null
  }
  return {
    host: d.host,
    port: typeof d.port === 'number' ? d.port : 22,
    expected_fingerprint: String(d.expected_fingerprint ?? ''),
    received_fingerprint: d.received_fingerprint,
    received_key: d.received_key,
    key_type: String(d.key_type ?? ''),
  }
}
