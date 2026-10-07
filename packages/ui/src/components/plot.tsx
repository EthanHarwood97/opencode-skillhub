import { useEffect, useRef, useState } from "react"

/** Guarded matchMedia — jsdom and old browsers simply get "no". */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function useInView<T extends Element>(ref: React.RefObject<T | null>, rootMargin = "-40px"): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || inView) return
    if (typeof IntersectionObserver === "undefined") {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setInView(true)
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, rootMargin, inView])
  return inView
}

/** 0→1 on view, plotter easing. Reduced motion resolves instantly to 1. */
export function useDrawProgress(active: boolean, durationMs = 900, delayMs = 0): number {
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0))
  useEffect(() => {
    if (!active) return
    if (prefersReducedMotion() || durationMs <= 0) {
      setProgress(1)
      return
    }
    let raf = 0
    let start: number | undefined
    const tick = (time: number) => {
      if (start === undefined) start = time + delayMs
      const t = Math.min(1, Math.max(0, (time - start) / durationMs))
      // ease-plot: cubic-bezier(0.65, 0, 0.35, 1) approximated
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      setProgress(eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, durationMs, delayMs])
  return progress
}

/** Number that "plots" itself when it enters the viewport. */
export function Counter({
  value,
  format = (n: number) => String(n),
  duration = 900,
  className,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, "-20px")
  const progress = useDrawProgress(inView, duration)
  // no IntersectionObserver (jsdom/tests) or reduced motion → resolve instantly
  const instant = typeof IntersectionObserver === "undefined" || prefersReducedMotion()
  const display = instant || progress >= 1 ? value : Math.round(value * progress)
  return (
    <span ref={ref} className={className}>
      {format(display)}
    </span>
  )
}

/**
 * SVG path that draws itself like a plotter stroke.
 * jsdom has no getTotalLength → paths render fully drawn.
 */
export function DrawPath({
  d,
  stroke = "var(--ink)",
  width = 1.5,
  duration = 900,
  delay = 0,
  className,
  fill = "none",
  dashed = false,
  opacity = 1,
}: {
  d: string
  stroke?: string
  width?: number
  duration?: number
  delay?: number
  className?: string
  fill?: string
  dashed?: boolean
  opacity?: number
}) {
  const ref = useRef<SVGPathElement>(null)
  const inView = useInView(ref, "-30px")
  const progress = useDrawProgress(inView, duration, delay)
  const [length, setLength] = useState<number | null>(null)
  useEffect(() => {
    try {
      setLength(ref.current?.getTotalLength() ?? null)
    } catch {
      setLength(null)
    }
  }, [d])
  const drawable = length !== null && progress < 1
  return (
    <path
      ref={ref}
      d={d}
      style={{ stroke, fill, opacity }}
      stroke={stroke}
      fill={fill}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed && !drawable ? "3 4" : drawable ? `${length}` : undefined}
      strokeDashoffset={drawable ? length * (1 - progress) : undefined}
      className={className}
    />
  )
}

/** Small plotted line for deltas. Draws on view; no axes, no fuss. */
export function Sparkline({
  points,
  width = 72,
  height = 18,
  stroke = "var(--accent)",
  width2,
}: {
  points: number[]
  width?: number
  height?: number
  stroke?: string
  width2?: number
}) {
  if (points.length < 2) return null
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  const step = width / (points.length - 1)
  const d = points.map((point, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)} ${(height - ((point - min) / range) * height).toFixed(1)}`).join(" ")
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: "block" }}>
      <DrawPath d={d} stroke={stroke} width={width2 ?? 1.25} duration={700} />
    </svg>
  )
}

/** A bar that plots its width, used for scores and coverage. */
export function PlotBar({ value, max = 100, tone = "ink" }: { value: number; max?: number; tone?: "ink" | "accent" | "hatch" }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, "-10px")
  const progress = useDrawProgress(inView, 800)
  const pct = Math.max(0, Math.min(1, value / max)) * 100 * progress
  const background = tone === "accent" ? "var(--accent)" : tone === "hatch" ? "repeating-linear-gradient(-45deg, var(--line-strong) 0 2px, transparent 2px 4px)" : "var(--ink)"
  return (
    <span ref={ref} className="plotbar" aria-hidden="true">
      <span className="plotbarFill" style={{ width: `${pct}%`, background }} />
    </span>
  )
}
