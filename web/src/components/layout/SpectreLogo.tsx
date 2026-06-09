import { motion } from 'framer-motion'
import { SPECTRE_SIDEBAR_MARK, SPECTRE_SUBTITLE, SPECTRE_TITLE } from '@/constants/branding'
import { clsx } from 'clsx'
import { GlitchText } from '@/components/layout/GlitchText'

const letters = SPECTRE_TITLE.split('')

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.15 },
  },
}

const letterVariants = {
  hidden: { opacity: 0, y: 6, filter: 'blur(3px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.35, ease: 'easeOut' },
  },
}

type Variant = 'sidebar' | 'navbar' | 'hero'

interface SpectreLogoProps {
  variant?: Variant
  className?: string
}

function AnimatedTitle({ sizeClass }: { sizeClass: string }) {
  return (
    <GlitchText
      text={SPECTRE_TITLE}
      className={clsx('relative', sizeClass)}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      aria-label={SPECTRE_TITLE}
    >
      {letters.map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          variants={letterVariants}
          className={clsx(
            'relative inline-block',
            char === '.' ? 'text-purple-mid opacity-70' : 'text-purple-bright'
          )}
        >
          {char}
        </motion.span>
      ))}
    </GlitchText>
  )
}

function Subtitle({ className }: { className?: string }) {
  return (
    <p
      className={clsx(
        'font-mono uppercase tracking-wider text-text-muted leading-snug',
        className
      )}
      title={SPECTRE_SUBTITLE}
    >
      {SPECTRE_SUBTITLE}
    </p>
  )
}

export function SpectreLogo({ variant = 'hero', className }: SpectreLogoProps) {
  if (variant === 'sidebar') {
    return (
      <div
        className={clsx('mb-4 flex shrink-0 items-center justify-center', className)}
        title={`${SPECTRE_TITLE}\n${SPECTRE_SUBTITLE}`}
      >
        <GlitchText
          text={SPECTRE_SIDEBAR_MARK}
          className="relative font-display text-xl font-bold text-purple-bright"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          aria-label={SPECTRE_TITLE}
        >
          {SPECTRE_SIDEBAR_MARK}
        </GlitchText>
      </div>
    )
  }

  if (variant === 'navbar') {
    return (
      <div className={clsx('flex flex-col min-w-0', className)}>
        <AnimatedTitle sizeClass="font-display text-[11px] font-bold tracking-[0.2em]" />
        <Subtitle className="text-[8px] mt-0.5 line-clamp-1 max-w-[280px] opacity-70" />
      </div>
    )
  }

  return (
    <div className={clsx('flex flex-col', className)}>
      <AnimatedTitle sizeClass="font-display text-2xl font-bold tracking-[0.15em]" />
      <Subtitle className="text-[10px] mt-1.5 max-w-xl opacity-80" />
    </div>
  )
}
