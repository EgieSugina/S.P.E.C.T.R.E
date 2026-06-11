import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Server,
  Terminal,
  FolderOpen,
  RefreshCw,
  Settings,
  KeyRound,
  Menu,
  X,
  Lock,
  Unlock,
} from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import { SpectreLogo } from '@/components/layout/SpectreLogo'
import { useSettingsStore } from '@/store/settingsStore'
import { useConnectionStore } from '@/store/connectionStore'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/connections', icon: Server, label: 'Connections' },
  { to: '/terminal', icon: Terminal, label: 'Terminal' },
  { to: '/files', icon: FolderOpen, label: 'Files' },
  { to: '/proxy', icon: RefreshCw, label: 'Proxy' },
  { to: '/keys', icon: KeyRound, label: 'Keys' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

function NavTab({
  to,
  icon: Icon,
  label,
  end,
  onClick,
}: {
  to: string
  icon: typeof LayoutDashboard
  label: string
  end?: boolean
  onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'relative flex items-center gap-2 px-3 py-2 font-mono text-[11px] uppercase tracking-wider whitespace-nowrap rounded-brutal transition-colors shrink-0',
          isActive
            ? 'text-purple-bright bg-purple-core/10'
            : 'text-text-muted hover:text-purple-bright hover:bg-hover'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={15} className={clsx(isActive && 'drop-shadow-[0_0_6px_rgba(167,139,250,0.6)]')} />
          <span>{label}</span>
          {isActive && (
            <motion.span
              layoutId="nav-underline"
              className="absolute bottom-0 left-2 right-2 h-[2px] bg-purple-bright rounded-full shadow-[0_0_8px_rgba(124,58,237,0.8)] animate-[pulse-purple_2s_ease-in-out_infinite]"
            />
          )}
        </>
      )}
    </NavLink>
  )
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { vaultLocked, vaultConfigured } = useSettingsStore()
  const activeCount = Object.keys(useConnectionStore((s) => s.activeConnIds)).length

  return (
    <header className="border-b border-[var(--border-default)] bg-surface/80 backdrop-blur-sm z-20">
      <div className="flex items-center gap-3 px-4 h-14 min-w-0">
        <SpectreLogo variant="navbar" className="shrink-0 hidden md:flex" />

        <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center min-w-0 overflow-x-auto">
          {nav.map((item) => (
            <NavTab key={item.to} {...item} />
          ))}
        </nav>

        <div className="flex items-center gap-3 ml-auto shrink-0">
          {activeCount > 0 && (
            <span className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] text-term-green">
              <span className="w-1.5 h-1.5 rounded-full bg-term-green animate-[status-online_2s_ease-in-out_infinite]" />
              {activeCount} LIVE
            </span>
          )}

          <div
            className="hidden sm:flex items-center gap-1.5 font-mono text-[10px]"
            title={vaultConfigured ? (vaultLocked ? 'Vault locked' : 'Vault unlocked') : 'Vault not configured'}
          >
            {vaultLocked || !vaultConfigured ? (
              <Lock size={12} className="text-term-amber" />
            ) : (
              <Unlock size={12} className="text-term-green" />
            )}
            <span className={vaultLocked || !vaultConfigured ? 'text-term-amber' : 'text-term-green'}>
              {vaultConfigured ? (vaultLocked ? 'LOCKED' : 'VAULT OK') : 'NO VAULT'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-core animate-[status-online_2s_ease-in-out_infinite]" />
            <span className="font-mono text-[10px] text-text-secondary hidden sm:inline">ONLINE</span>
          </div>

          <button
            type="button"
            className="lg:hidden p-2 text-text-muted hover:text-purple-bright rounded-brutal hover:bg-hover"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <div className="lg:hidden border-t border-[var(--border-default)] overflow-x-auto">
        <nav className="flex items-center gap-1 px-3 py-2 min-w-max">
          {nav.map((item) => (
            <NavTab key={item.to} {...item} />
          ))}
        </nav>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden overflow-hidden border-t border-[var(--border-default)] bg-void/95"
          >
            <div className="px-4 py-3 md:hidden">
              <SpectreLogo variant="navbar" />
            </div>
            <nav className="flex flex-col gap-1 px-3 pb-3">
              {nav.map((item) => (
                <NavTab key={item.to} {...item} onClick={() => setMobileOpen(false)} />
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
