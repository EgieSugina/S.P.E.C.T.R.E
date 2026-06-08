import { clsx } from 'clsx'

interface BadgeProps {
  children: React.ReactNode
  color?: 'purple' | 'green' | 'red' | 'amber'
}

export function Badge({ children, color = 'purple' }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-block px-2 py-0.5 font-mono text-[10px] uppercase border rounded-brutal',
        color === 'purple' && 'border-purple-core/40 text-purple-bright',
        color === 'green' && 'border-term-green/40 text-term-green',
        color === 'red' && 'border-term-red/40 text-term-red',
        color === 'amber' && 'border-term-amber/40 text-term-amber'
      )}
    >
      {children}
    </span>
  )
}
