import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

const MAX_DOTS = 800
const TARGET_FPS = 30
const GLOW_THRESHOLD = 0.6
const GLOW_SPRITE_RADIUS = 12

const isFirefox =
  typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)

function createGlowSprite(color: string, diameter: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const size = Math.ceil(diameter)
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')
  if (!c) return canvas
  const half = size / 2
  const grad = c.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0, color)
  grad.addColorStop(0.45, color)
  grad.addColorStop(1, 'transparent')
  c.fillStyle = grad
  c.beginPath()
  c.arc(half, half, half, 0, Math.PI * 2)
  c.fill()
  return canvas
}

type DottedGlowBackgroundProps = {
  className?: string
  gap?: number
  radius?: number
  color?: string
  darkColor?: string
  glowColor?: string
  darkGlowColor?: string
  colorLightVar?: string
  colorDarkVar?: string
  glowColorLightVar?: string
  glowColorDarkVar?: string
  opacity?: number
  backgroundOpacity?: number
  speedMin?: number
  speedMax?: number
  speedScale?: number
}

export function DottedGlowBackground({
  className,
  gap = 12,
  radius = 2,
  color = 'rgba(124, 58, 237, 0.35)',
  darkColor,
  glowColor = 'rgba(167, 139, 250, 0.85)',
  darkGlowColor,
  colorLightVar,
  colorDarkVar,
  glowColorLightVar,
  glowColorDarkVar,
  opacity = 0.6,
  backgroundOpacity = 0,
  speedMin = 0.4,
  speedMax = 1.3,
  speedScale = 1,
}: DottedGlowBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [resolvedColor, setResolvedColor] = useState<string>(color)
  const [resolvedGlowColor, setResolvedGlowColor] = useState<string>(glowColor)

  const resolveCssVariable = (el: Element, variableName?: string): string | null => {
    if (!variableName) return null
    const normalized = variableName.startsWith('--') ? variableName : `--${variableName}`
    const fromEl = getComputedStyle(el).getPropertyValue(normalized).trim()
    if (fromEl) return fromEl
    const fromRoot = getComputedStyle(document.documentElement).getPropertyValue(normalized).trim()
    return fromRoot || null
  }

  const detectDarkMode = (): boolean => {
    const root = document.documentElement
    if (root.dataset.theme) return true
    if (root.classList.contains('dark')) return true
    if (root.classList.contains('light')) return false
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  }

  useEffect(() => {
    const container = containerRef.current ?? document.documentElement

    const compute = () => {
      const isDark = detectDarkMode()
      let nextColor = color
      let nextGlow = glowColor

      if (isDark) {
        nextColor = resolveCssVariable(container, colorDarkVar) || darkColor || nextColor
        nextGlow = resolveCssVariable(container, glowColorDarkVar) || darkGlowColor || nextGlow
      } else {
        nextColor = resolveCssVariable(container, colorLightVar) || nextColor
        nextGlow = resolveCssVariable(container, glowColorLightVar) || nextGlow
      }

      setResolvedColor(nextColor)
      setResolvedGlowColor(nextGlow)
    }

    compute()

    const mql = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
    const handleMql = () => compute()
    mql?.addEventListener('change', handleMql)

    const mo = new MutationObserver(() => compute())
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })

    return () => {
      mql?.removeEventListener('change', handleMql)
      mo.disconnect()
    }
  }, [
    color,
    darkColor,
    glowColor,
    darkGlowColor,
    colorLightVar,
    colorDarkVar,
    glowColorLightVar,
    glowColorDarkVar,
  ])

  useEffect(() => {
    const el = canvasRef.current
    const container = containerRef.current
    if (!el || !container) return

    const ctx = el.getContext('2d')
    if (!ctx) return

    let raf = 0
    let stopped = false
    let isVisible = !document.hidden
    let lastFrame = 0
    const frameInterval = 1000 / TARGET_FPS

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

    const dpr = isFirefox
      ? 1
      : Math.min(Math.max(1, window.devicePixelRatio || 1), 2)

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      el.width = Math.max(1, Math.floor(width * dpr))
      el.height = Math.max(1, Math.floor(height * dpr))
      el.style.width = `${Math.floor(width)}px`
      el.style.height = `${Math.floor(height)}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(container)
    resize()

    let dots: { x: number; y: number; phase: number; speed: number }[] = []
    let effectiveGap = gap
    let glowSprite = createGlowSprite(resolvedGlowColor, GLOW_SPRITE_RADIUS * 2)

    const regenDots = () => {
      dots = []
      const { width, height } = container.getBoundingClientRect()

      effectiveGap = gap
      let cols = Math.ceil(width / effectiveGap) + 2
      let rows = Math.ceil(height / effectiveGap) + 2
      while (cols * rows > MAX_DOTS) {
        effectiveGap *= 1.12
        cols = Math.ceil(width / effectiveGap) + 2
        rows = Math.ceil(height / effectiveGap) + 2
      }

      const min = Math.min(speedMin, speedMax)
      const max = Math.max(speedMin, speedMax)
      for (let i = -1; i < cols; i++) {
        for (let j = -1; j < rows; j++) {
          const x = i * effectiveGap + (j % 2 === 0 ? 0 : effectiveGap * 0.5)
          const y = j * effectiveGap
          const phase = Math.random() * Math.PI * 2
          const span = Math.max(max - min, 0)
          const speed = min + Math.random() * span
          dots.push({ x, y, phase, speed })
        }
      }
    }

    regenDots()
    glowSprite = createGlowSprite(resolvedGlowColor, GLOW_SPRITE_RADIUS * 2)

    const drawBackground = (width: number, height: number) => {
      if (backgroundOpacity <= 0) return
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        Math.min(width, height) * 0.1,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.7,
      )
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, `rgba(0,0,0,${Math.min(Math.max(backgroundOpacity, 0), 1)})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
    }

    const drawDots = (now: number) => {
      const { width, height } = container.getBoundingClientRect()
      ctx.clearRect(0, 0, el.width, el.height)
      ctx.globalAlpha = opacity
      drawBackground(width, height)

      const time = reducedMotion ? 0 : (now / 1000) * Math.max(speedScale, 0)
      const spriteSize = GLOW_SPRITE_RADIUS * 2

      ctx.fillStyle = resolvedColor

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i]
        const mod = (time * d.speed + d.phase) % 2
        const lin = mod < 1 ? mod : 2 - mod
        const a = reducedMotion ? 0.4 : 0.25 + 0.55 * lin

        if (!reducedMotion && a > GLOW_THRESHOLD) {
          const glow = (a - GLOW_THRESHOLD) / (1 - GLOW_THRESHOLD)
          const size = spriteSize * (0.6 + 0.4 * glow)
          ctx.globalAlpha = glow * opacity * 0.7
          ctx.drawImage(glowSprite, d.x - size / 2, d.y - size / 2, size, size)
        }

        ctx.globalAlpha = a * opacity
        ctx.beginPath()
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const draw = (now: number) => {
      if (stopped) return
      if (!isVisible) {
        raf = requestAnimationFrame(draw)
        return
      }

      if (now - lastFrame < frameInterval) {
        raf = requestAnimationFrame(draw)
        return
      }
      lastFrame = now

      drawDots(now)
      if (!reducedMotion) {
        raf = requestAnimationFrame(draw)
      }
    }

    const handleResize = () => {
      resize()
      regenDots()
    }

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const intersecting = entries[0]?.isIntersecting ?? true
        isVisible = intersecting && !document.hidden
      },
      { threshold: 0.1 },
    )
    intersectionObserver.observe(container)

    const handleVisibility = () => {
      isVisible = !document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibility)

    window.addEventListener('resize', handleResize)

    if (reducedMotion) {
      drawDots(0)
    } else {
      raf = requestAnimationFrame(draw)
    }

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibility)
      intersectionObserver.disconnect()
      ro.disconnect()
    }
  }, [
    gap,
    radius,
    resolvedColor,
    resolvedGlowColor,
    opacity,
    backgroundOpacity,
    speedMin,
    speedMax,
    speedScale,
  ])

  return (
    <div ref={containerRef} className={cn('absolute inset-0', className)}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
