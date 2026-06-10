import { motion } from 'framer-motion'
import { ArrowRight, FolderOpen, Monitor, Plus, Server, Terminal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/shared/Button'
import { cn } from '@/lib/cn'

type EmptySessionVariant = 'terminal' | 'rdp' | 'files'

const config = {
  terminal: {
    icon: Terminal,
    title: 'No terminal sessions',
    subtitle: 'Connect to a server, then open a tab to start a shell.',
    stepConnect: 'Connect an SSH server on Connections',
    stepOpen: 'Click + to open a terminal tab',
  },
  rdp: {
    icon: Monitor,
    title: 'No desktop sessions',
    subtitle: 'Connect to an RDP server, then open a tab to view the desktop.',
    stepConnect: 'Connect an RDP server on Connections',
    stepOpen: 'Click + to open a desktop tab',
  },
  files: {
    icon: FolderOpen,
    title: 'No server selected',
    subtitle: 'Choose a live connection to browse remote files.',
    stepConnect: 'Connect a server on Connections',
    stepOpen: 'Pick a connection from the dropdown above',
  },
} as const

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
}

interface EmptySessionPaneProps {
  variant: EmptySessionVariant
  hasActiveConnection?: boolean
  onNewTab?: () => void
  className?: string
}

export function EmptySessionPane({
  variant,
  hasActiveConnection = false,
  onNewTab,
  className,
}: EmptySessionPaneProps) {
  const navigate = useNavigate()
  const { icon: Icon, title, subtitle, stepConnect, stepOpen } = config[variant]

  return (
    <motion.div
      className={cn(
        'flex h-full items-center justify-center p-6',
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="flex max-w-md flex-col items-center rounded-brutal border border-dashed border-purple-core/25 bg-deep/50 px-8 py-10 text-center"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="relative mb-5">
          <motion.div
            className="absolute inset-0 rounded-full bg-purple-core/20 blur-xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="relative flex h-16 w-16 items-center justify-center rounded-brutal border border-purple-core/40 bg-purple-core/10"
            whileHover={{ scale: 1.05, borderColor: 'var(--purple-bright)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Icon size={28} className="text-purple-bright" strokeWidth={1.5} />
          </motion.div>
        </motion.div>

        <motion.h2 variants={item} className="font-mono text-sm uppercase tracking-wider text-text-primary">
          {title}
        </motion.h2>
        <motion.p variants={item} className="mt-2 font-mono text-xs leading-relaxed text-text-muted">
          {subtitle}
        </motion.p>

        <motion.ol variants={item} className="mt-6 w-full space-y-3 text-left">
          <li className="flex items-start gap-3 font-mono text-[11px] text-text-secondary">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-purple-core/30 bg-purple-core/10 text-[10px] text-purple-bright">
              1
            </span>
            <span className="flex items-center gap-2 pt-0.5">
              <Server size={12} className="shrink-0 text-purple-core" />
              {stepConnect}
            </span>
          </li>
          <li className="flex items-start gap-3 font-mono text-[11px] text-text-secondary">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-purple-core/30 bg-purple-core/10 text-[10px] text-purple-bright">
              2
            </span>
            <span className="flex items-center gap-2 pt-0.5">
              <motion.span
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Plus size={12} className="shrink-0 text-purple-bright" />
              </motion.span>
              {stepOpen}
            </span>
          </li>
        </motion.ol>

        <motion.div variants={item} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {!hasActiveConnection ? (
            <Button onClick={() => navigate('/connections')}>
              <span className="flex items-center gap-2">
                Go to Connections
                <ArrowRight size={12} />
              </span>
            </Button>
          ) : (
            onNewTab && (
              <Button onClick={onNewTab}>
                <span className="flex items-center gap-2">
                  <Plus size={12} />
                  Open Tab
                </span>
              </Button>
            )
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
