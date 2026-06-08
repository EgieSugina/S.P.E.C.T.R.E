import { clsx } from 'clsx'
import { motion } from 'framer-motion'

interface DashboardCardProps {
  title: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
  delay?: number
}

export function DashboardCard({ title, children, className, action, delay = 0 }: DashboardCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      className={clsx(
        'border border-[var(--border-default)] border-l-[3px] border-l-purple-core rounded-brutal bg-surface flex flex-col min-h-0',
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-default)] bg-elevated/40">
        <h3 className="font-mono text-[10px] text-text-muted uppercase tracking-widest">{title}</h3>
        {action}
      </div>
      <div className="p-4 flex-1 min-h-0 overflow-auto">{children}</div>
    </motion.section>
  )
}
