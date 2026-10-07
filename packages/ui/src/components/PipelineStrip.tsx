import { useRef } from "react"
import { useDrawProgress, useInView } from "./plot.tsx"
import styles from "./PipelineStrip.module.css"

export type PipelineStep = {
  id: string
  label: string
  detail: string
  state: "ok" | "warn" | "error" | "idle"
}

const STATE_LABEL: Record<PipelineStep["state"], string> = {
  ok: "ok",
  warn: "warn",
  error: "error",
  idle: "idle",
}

export function PipelineStrip({ steps }: { steps: PipelineStep[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, "-20px")
  const progress = useDrawProgress(inView, 1100)
  return (
    <div className={styles.strip} ref={ref} role="list" aria-label="Pipeline stages">
      {steps.map((step, index) => (
        <div key={step.id} className={styles.step} role="listitem">
          <span
            className={`${styles.marker} ${styles[step.state]}`}
            style={{ transform: `translateY(${(1 - Math.min(1, Math.max(0, (progress - index * 0.12) / 0.5))) * -6}px)` }}
            aria-hidden="true"
          />
          <span className={styles.label}>
            {step.label}
            <span className={styles.state}>[{STATE_LABEL[step.state]}]</span>
          </span>
          <span className={styles.detail}>{step.detail}</span>
          {index < steps.length - 1 ? (
            <span
              className={styles.connector}
              style={{ transform: `scaleX(${Math.min(1, Math.max(0, (progress - 0.1 - index * 0.12) / 0.4))})` }}
              aria-hidden="true"
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}
