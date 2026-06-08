import { InputHTMLAttributes } from 'react'
import { clsx } from 'clsx'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full bg-transparent border-b border-[var(--border-default)] px-1 py-2',
        'font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
        'focus:outline-none focus:border-purple-core transition-colors',
        className
      )}
      {...props}
    />
  )
}
