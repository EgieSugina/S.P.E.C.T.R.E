import { clsx } from 'clsx'
import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'px-4 py-2 font-mono text-xs uppercase tracking-wider rounded-brutal transition-all',
        variant === 'primary' && 'bg-purple-core/20 border border-purple-core/40 text-purple-bright hover:bg-purple-core/30',
        variant === 'ghost' && 'border border-[var(--border-default)] text-text-secondary hover:border-purple-core/40 hover:text-purple-bright',
        variant === 'danger' && 'border border-term-red/40 text-term-red hover:bg-term-red/10',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
