import type { ButtonHTMLAttributes, ReactNode } from "react"
import { PlotBar } from "./plot.tsx"
import styles from "./primitives.module.css"

export type ChipTone = "neutral" | "muted" | "accent" | "info" | "low" | "medium" | "high" | "critical"

const CHIP_CLASS: Record<ChipTone, string> = {
  neutral: styles.chipNeutral,
  muted: styles.chipMuted,
  accent: styles.chipAccent,
  info: styles.chipInfo,
  low: styles.chipLow,
  medium: styles.chipMedium,
  high: styles.chipHigh,
  critical: styles.chipCritical,
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: ChipTone }) {
  const dot = tone !== "neutral" && tone !== "muted" ? <span className={styles.chipDot} aria-hidden="true" /> : null
  return (
    <span className={`${styles.chip} ${CHIP_CLASS[tone]}`}>
      {dot}
      {children}
    </span>
  )
}

export function Button({ tone = "ghost", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger" }) {
  const toneClass = tone === "primary" ? styles.buttonPrimary : tone === "danger" ? styles.buttonDanger : ""
  return <button type="button" {...props} className={`${styles.button} ${toneClass}`} />
}

export function ScoreMeter({ value, label = "score" }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <span className={styles.meter} role="img" aria-label={`${label}: ${Math.round(clamped)} of 100`}>
      <span className={styles.meterValue}>{Math.round(clamped)}</span>
      <span className={styles.meterTrack}>
        <span className={styles.meterFill} style={{ width: `${clamped}%` }} />
      </span>
    </span>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </div>
  )
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: string }) {
  return <span className={styles.skeleton} style={{ height, width }} aria-hidden="true" />
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.state}>
      <h2 className={styles.stateTitle}>{title}</h2>
      {children ? <div className={styles.stateBody}>{children}</div> : null}
    </div>
  )
}

export function ErrorState({ title, children, retry }: { title: string; children?: ReactNode; retry?: () => void }) {
  return (
    <div className={styles.state} role="alert">
      <h2 className={styles.stateTitle}>{title}</h2>
      {children ? <div className={styles.stateBody}>{children}</div> : null}
      {retry ? <Button onClick={retry}>Try again</Button> : null}
    </div>
  )
}

export { PlotBar }
