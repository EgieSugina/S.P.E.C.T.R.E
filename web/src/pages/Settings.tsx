import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useSettingsStore } from '@/store/settingsStore'
import { THEMES, resolveTheme } from '@/lib/theme'
import { Input } from '@/components/shared/Input'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ApiError } from '@/api/client'
import { SpectreLogo } from '@/components/layout/SpectreLogo'

export function Settings() {
  const { settings, vaultLocked, vaultConfigured, fetch, update, unlockVault, setupVault } = useSettingsStore()
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch()
  }, [fetch])

  const handleVault = async () => {
    setMessage('')
    setError('')

    if (!password) {
      setError('Password is required')
      return
    }
    if (!vaultConfigured && password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    try {
      if (!vaultConfigured) {
        await setupVault(password)
        setMessage('Vault configured and unlocked.')
      } else {
        await unlockVault(password)
        setMessage('Vault unlocked.')
      }
      setPassword('')
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`[${e.code}] ${e.message}`)
      } else {
        setError((e as Error).message)
      }
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6 overflow-auto h-full">
      <section className="bg-surface border border-[var(--border-default)] border-l-[3px] border-l-purple-core rounded-brutal p-5">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-display text-purple-bright">Security Vault</h3>
          <Badge color={vaultLocked ? 'amber' : 'green'}>
            {vaultLocked ? 'locked' : 'unlocked'}
          </Badge>
        </div>
        <p className="font-mono text-xs text-text-muted mb-4">
          Master password encrypts SSH credentials with AES-256-GCM. Never stored on disk.
        </p>
        <Input
          type="password"
          minLength={vaultConfigured ? undefined : 8}
          placeholder={vaultConfigured ? 'Master password' : 'Set master password (8+ chars)'}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (error) setError('')
          }}
        />
        <Button className="mt-3" onClick={handleVault}>
          {vaultConfigured ? 'Unlock Vault' : 'Setup Vault'}
        </Button>
        {error && (
          <p className="font-mono text-xs text-term-red mt-2" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="font-mono text-xs text-term-green mt-2">{message}</p>
        )}
      </section>

      <section className="bg-surface border border-[var(--border-default)] border-l-[3px] border-l-purple-core rounded-brutal p-5">
        <h3 className="font-display text-purple-bright mb-2">Appearance</h3>
        <p className="font-mono text-xs text-text-muted mb-4">
          Brutalist dark themes — default purple, pure neutral, or accent variants.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {THEMES.map((theme) => {
            const active = resolveTheme(settings.theme) === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => update({ theme: theme.id })}
                className={clsx(
                  'p-3 rounded-brutal border text-left transition-colors',
                  active
                    ? 'border-purple-core bg-purple-core/10'
                    : 'border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-hover/30'
                )}
              >
                <div className="flex gap-2 mb-2">
                  <span
                    className="w-5 h-5 rounded-brutal border border-[var(--border-default)]"
                    style={{ background: theme.bg }}
                    aria-hidden
                  />
                  <span
                    className="w-5 h-5 rounded-brutal border border-[var(--border-default)]"
                    style={{ background: theme.swatch }}
                    aria-hidden
                  />
                </div>
                <div className="font-mono text-xs text-purple-bright uppercase tracking-wide">
                  {theme.label}
                </div>
                <div className="font-mono text-[10px] text-text-muted mt-1">{theme.description}</div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="bg-surface border border-[var(--border-default)] rounded-brutal p-5">
        <h3 className="font-display text-purple-bright mb-4">Upload Settings</h3>
        <label className="font-mono text-[10px] text-text-muted uppercase">Max Concurrent Uploads (1-10)</label>
        <Input
          type="number"
          min={1}
          max={10}
          value={settings.upload_max_concurrent || '3'}
          onChange={(e) => update({ upload_max_concurrent: e.target.value })}
        />
      </section>

      <section className="bg-surface border border-[var(--border-default)] rounded-brutal p-5">
        <h3 className="font-display text-purple-bright mb-2">About</h3>
        <SpectreLogo variant="hero" className="mb-2" />
        <p className="font-mono text-xs text-text-muted mt-2 italic">You were never here.</p>
      </section>
    </div>
  )
}
