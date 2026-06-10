import { cn } from '@/lib/cn'
import { useRef, type ReactNode } from 'react'
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion'

type MovingBorderProps = {
  duration?: number
  rx?: string
  ry?: string
}

/**
 * Drives a child element around the perimeter of an SVG <rect> using
 * getPointAtLength, so a glow blob physically travels along the border.
 */
function MovingBorder({
  children,
  duration = 3000,
  rx = '2',
  ry = '2',
}: MovingBorderProps & { children: ReactNode }) {
  const pathRef = useRef<SVGRectElement>(null)
  const progress = useMotionValue(0)

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength()
    if (length) {
      const pxPerMs = length / duration
      progress.set((time * pxPerMs) % length)
    }
  })

  const x = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).x ?? 0)
  const y = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).y ?? 0)
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute h-full w-full"
        width="100%"
        height="100%"
      >
        <rect fill="none" width="100%" height="100%" rx={rx} ry={ry} ref={pathRef} />
      </svg>
      <motion.div
        style={{ position: 'absolute', top: 0, left: 0, display: 'inline-block', transform }}
      >
        {children}
      </motion.div>
    </>
  )
}

type MovingBorderContainerProps = {
  children: ReactNode
  duration?: number
  borderRadius?: number
  className?: string
}

export function MovingBorderContainer({
  children,
  duration = 3000,
  borderRadius = 2,
  className,
}: MovingBorderContainerProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div
      className={cn('relative overflow-hidden p-[1.5px]', className)}
      style={{ borderRadius }}
    >
      {reduceMotion ? (
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            borderRadius,
            background:
              'linear-gradient(135deg, var(--purple-core), var(--purple-glow), var(--purple-core))',
            opacity: 0.6,
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <MovingBorder duration={duration} rx={String(borderRadius)} ry={String(borderRadius)}>
            <div
              className="h-24 w-24 opacity-80"
              style={{
                background:
                  'radial-gradient(closest-side, var(--purple-glow) 0%, var(--purple-core) 35%, transparent 70%)',
              }}
            />
          </MovingBorder>
        </div>
      )}
      <div className="relative z-10" style={{ borderRadius }}>
        {children}
      </div>
    </div>
  )
}
