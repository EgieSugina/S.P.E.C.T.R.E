import { motion, type HTMLMotionProps } from 'framer-motion'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

type GlitchTextProps = Omit<HTMLMotionProps<'span'>, 'children'> & {
  /** Full string for RGB duplicate layers (::before / ::after) */
  text: string
  children: ReactNode
}

export function GlitchText({ text, className, children, ...props }: GlitchTextProps) {
  return (
    <motion.span
      className={clsx('cyber-glitch', className)}
      data-text={text}
      {...props}
    >
      <span className="cyber-glitch__core relative z-1 inline-flex flex-row items-baseline gap-0">
        {children}
      </span>
      <span className="spectre-shimmer-overlay pointer-events-none absolute inset-0 z-2" aria-hidden />
    </motion.span>
  )
}
