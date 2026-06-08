import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Server,
  Terminal,
  FolderOpen,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { clsx } from 'clsx'
import { SpectreLogo } from '@/components/layout/SpectreLogo'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/connections', icon: Server, label: 'Connections' },
  { to: '/terminal', icon: Terminal, label: 'Terminal' },
  { to: '/files', icon: FolderOpen, label: 'Files' },
  { to: '/proxy', icon: RefreshCw, label: 'Proxy & Tunnels' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  return (
    <aside className="w-16 flex flex-col items-center py-4 bg-void border-r border-[var(--border-default)] relative overflow-hidden">
      <SpectreLogo variant="sidebar" />
      <nav className="flex flex-col gap-2 flex-1">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              clsx(
                'p-3 rounded-brutal transition-all group',
                isActive
                  ? 'bg-purple-core/20 text-purple-bright shadow-[0_0_12px_rgba(124,58,237,0.4)]'
                  : 'text-text-muted hover:text-purple-bright hover:bg-hover'
              )
            }
          >
            <motion.div whileHover={{ scale: 1.15 }} transition={{ duration: 0.15 }}>
              <Icon size={20} />
            </motion.div>
          </NavLink>
        ))}
      </nav>
      <div className="text-[9px] font-mono text-text-muted text-center px-1 leading-tight">
        YOU WERE NEVER HERE
      </div>
    </aside>
  )
}
