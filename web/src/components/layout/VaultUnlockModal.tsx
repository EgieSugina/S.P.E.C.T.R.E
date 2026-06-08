import { FormEvent, useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettingsStore } from '@/store/settingsStore'
import { Input } from '@/components/shared/Input'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ApiError } from '@/api/client'

export function VaultUnlockModal() {
  const {
    vaultLocked,
    vaultConfigured,
    vaultModalOpen,
    fetch,
    unlockVault,
    setupVault,
    openVaultModal,
    closeVaultModal,
  } = useSettingsStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const needsVault = vaultLocked || !vaultConfigured
  const visible = vaultModalOpen && needsVault
  const isSetup = !vaultConfigured

  useEffect(() => {
    fetch().then(() => {
      const { vaultLocked: locked, vaultConfigured: configured } = useSettingsStore.getState()
      if (locked || !configured) {
        openVaultModal()
      }
    })
  }, [fetch, openVaultModal])

  useEffect(() => {
    if (!visible) {
      setPassword('')
      setError('')
    }
  }, [visible])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('Password is required')
      return
    }
    if (isSetup && password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      if (isSetup) {
        await setupVault(password)
      } else {
        await unlockVault(password)
      }
      setPassword('')
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
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-void/90 backdrop-blur-sm scanlines"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative w-full max-w-md mx-4 bg-elevated border-2 border-purple-core/60 border-l-[4px] border-l-purple-core rounded-brutal p-6 shadow-[0_0_40px_rgba(139,92,246,0.15)]"
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vault-modal-title"
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 border border-purple-core/40 rounded-brutal bg-purple-core/10">
                <Shield size={20} className="text-purple-bright" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 id="vault-modal-title" className="font-display text-lg text-purple-bright">
                    {isSetup ? 'Setup Security Vault' : 'Unlock Security Vault'}
                  </h2>
                  <Badge color={isSetup ? 'purple' : 'amber'}>
                    {isSetup ? 'first run' : 'locked'}
                  </Badge>
                </div>
                <p className="font-mono text-xs text-text-muted mt-1">
                  Credentials encrypted with AES-256-GCM. Master password never stored on disk.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="font-mono text-[10px] text-text-muted uppercase">
                  {isSetup ? 'Master Password (8+ chars)' : 'Master Password'}
                </label>
                <Input
                  type="password"
                  autoFocus
                  minLength={isSetup ? 8 : undefined}
                  placeholder={isSetup ? 'Set master password' : 'Enter master password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError('')
                  }}
                />
              </div>

              {error && (
                <p className="font-mono text-xs text-term-red border border-term-red/30 bg-term-red/10 rounded-brutal px-3 py-2" role="alert">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={closeVaultModal} disabled={loading}>
                  Later
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Working...' : isSetup ? 'Setup Vault' : 'Unlock Vault'}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
