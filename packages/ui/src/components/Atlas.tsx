import { useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { getSkills } from "../lib/api.ts"
import type { SkillCard } from "../lib/contract.ts"
import { CATEGORY_ORDER, categoryLabel, clampText, formatNumber } from "../lib/format.ts"
import { prefersReducedMotion, useDrawProgress, useInView } from "./plot.tsx"
import styles from "./Atlas.module.css"

const MAX_NODES = 4200
const PAGE_SIZE = 200

async function fetchAllSkills(): Promise<SkillCard[]> {
  const all: SkillCard[] = []
  for (let page = 1; page <= Math.ceil(MAX_NODES / PAGE_SIZE) + 1; page += 1) {
    const result = await getSkills({ page, pageSize: PAGE_SIZE, sort: "score" })
    all.push(...result.items)
    if (result.items.length === 0 || all.length >= result.total) break
  }
  return all.slice(0, MAX_NODES)
}

/** Deterministic jitter so a skill always lands on the same spot. */
const jitter = (id: string): number => {
  let hash = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 1000) / 1000
}

type Point = { x: number; y: number; skill: SkillCard }

export function Atlas() {
  const navigate = useNavigate()
  const { data, isPending, isError } = useQuery({ queryKey: ["atlas", "all-skills"], queryFn: fetchAllSkills, staleTime: 120_000 })

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inView = useInView(wrapRef, "-60px")
  const progress = useDrawProgress(inView, 1600)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<Point | null>(null)
  const pointsRef = useRef<Point[]>([])

  const skills = useMemo(() => data ?? [], [data])
  const byCategory = useMemo(() => {
    const groups = new Map<string, SkillCard[]>()
    for (const skill of skills) {
      const list = groups.get(skill.category) ?? []
      list.push(skill)
      groups.set(skill.category, list)
    }
    return groups
  }, [skills])

  useEffect(() => {
    const node = wrapRef.current
    if (!node || typeof ResizeObserver === "undefined") {
      setSize({ w: node?.clientWidth ?? 960, h: 420 })
      return
    }
    const observer = new ResizeObserver(() => setSize({ w: node.clientWidth, h: node.clientHeight }))
    observer.observe(node)
    setSize({ w: node.clientWidth, h: node.clientHeight })
    return () => observer.disconnect()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || size.w === 0) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size.w * dpr)
    canvas.height = Math.round(size.h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const style = getComputedStyle(wrap)
    const ink = style.getPropertyValue("--ink").trim() || "#191a16"
    const inkFaint = style.getPropertyValue("--ink-3").trim() || "#86877f"
    const line = style.getPropertyValue("--line-strong").trim() || "#b9b8ae"
    const accent = style.getPropertyValue("--accent").trim() || "#9e2820"
    const crit = style.getPropertyValue("--crit").trim() || "#9e2820"

    const padL = 38
    const padR = 14
    const padT = 18
    const padB = 52
    const innerW = size.w - padL - padR
    const innerH = size.h - padT - padB
    const colW = innerW / CATEGORY_ORDER.length

    // score gridlines
    ctx.font = "9px 'IBM Plex Mono', monospace"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    for (const value of [0, 25, 50, 75, 100]) {
      const y = padT + innerH - (value / 100) * innerH
      ctx.strokeStyle = value === 0 ? line : "rgba(134,135,127,0.35)"
      ctx.lineWidth = 1
      ctx.setLineDash(value === 0 ? [] : [2, 4])
      ctx.beginPath()
      ctx.moveTo(padL, y + 0.5)
      ctx.lineTo(size.w - padR, y + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = inkFaint
      ctx.fillText(String(value), padL - 6, y)
    }
    ctx.fillStyle = inkFaint
    ctx.textAlign = "left"
    ctx.fillText("SCORE", padL - 34, padT - 8)

    // plot columns, left to right as progress advances
    const points: Point[] = []
    const revealWindow = 0.45
    CATEGORY_ORDER.forEach((category, index) => {
      const column = byCategory.get(category) ?? []
      const colX = padL + colW * index
      const cx = colX + colW / 2
      const delay = (index / CATEGORY_ORDER.length) * (1 - revealWindow)
      const local = Math.max(0, Math.min(1, (progress - delay) / revealWindow))

      // column guide
      ctx.strokeStyle = "rgba(134,135,127,0.22)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx + 0.5, padT)
      ctx.lineTo(cx + 0.5, padT + innerH)
      ctx.stroke()

      // the plotter strike: draw the column bottom-up as local advances
      ctx.strokeStyle = "rgba(25,26,22,0.28)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx + 0.5, padT + innerH)
      ctx.lineTo(cx + 0.5, padT + innerH - local * innerH)
      ctx.stroke()

      for (const skill of column) {
        const jx = (jitter(skill.id) - 0.5) * (colW - 7)
        const x = cx + jx
        const y = padT + innerH - (skill.total / 100) * innerH
        // reveal gate: bottom-up, node appears when the strike passes its score
        const threshold = 1 - skill.total / 100
        if (local < threshold) continue
        const r = skill.active ? 3 : skill.installed ? 2.4 : 1.7
        ctx.beginPath()
        if (skill.status === "quarantined") {
          ctx.strokeStyle = crit
          ctx.lineWidth = 1
          const s = 2.4
          ctx.moveTo(x - s, y - s)
          ctx.lineTo(x + s, y + s)
          ctx.moveTo(x + s, y - s)
          ctx.lineTo(x - s, y + s)
          ctx.stroke()
        } else {
          ctx.fillStyle = skill.active ? accent : skill.installed ? accent : "rgba(25,26,22,0.55)"
          ctx.globalAlpha = skill.active || skill.installed ? 0.95 : 0.62
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
          if (skill.active) {
            ctx.strokeStyle = accent
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(x, y, r + 2.6, 0, Math.PI * 2)
            ctx.stroke()
          } else if (skill.updateAvailable) {
            ctx.strokeStyle = accent
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(x, y, r + 2.2, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
        points.push({ x, y, skill })
      }

      // category label
      if (local > 0.55) {
        ctx.save()
        ctx.translate(cx, padT + innerH + 10)
        ctx.rotate(-Math.PI / 3.1)
        ctx.fillStyle = inkFaint
        ctx.font = "9.5px 'IBM Plex Mono', monospace"
        ctx.textAlign = "left"
        ctx.textBaseline = "middle"
        ctx.fillText(categoryLabel(category).toUpperCase(), 0, 0)
        ctx.restore()
      }
    })
    pointsRef.current = points

    if (hover) {
      const { x, y } = hover
      ctx.strokeStyle = accent
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, padT)
      ctx.moveTo(x, y)
      ctx.lineTo(padL, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(x, y, 4.5, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, [size, byCategory, progress, hover])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    // redraw once webfonts are in, so labels use Plex Mono
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (fonts?.ready) void fonts.ready.then(() => draw())
  }, [draw])

  const findNearest = (mx: number, my: number): Point | null => {
    let best: Point | null = null
    let bestDist = 11 * 11
    for (const point of pointsRef.current) {
      const dx = point.x - mx
      const dy = point.y - my
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        best = point
      }
    }
    return best
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const next = findNearest(event.clientX - rect.left, event.clientY - rect.top)
    setHover((current) => (current?.skill.id === next?.skill.id ? current : next))
  }

  const onClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const hit = findNearest(event.clientX - rect.left, event.clientY - rect.top)
    if (hit) navigate(`/skills/${hit.skill.id}`)
  }

  const counts = useMemo(() => {
    const installed = skills.filter((skill) => skill.installed).length
    const active = skills.filter((skill) => skill.active).length
    return { installed, active, total: skills.length }
  }, [skills])

  if (isError) {
    return (
      <div className={styles.fallback}>
        <p className="pageHint">The atlas needs the catalog. Run a sync, then open the dashboard again.</p>
      </div>
    )
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label={`Plot of ${formatNumber(counts.total)} catalogued skills across ${CATEGORY_ORDER.length} domains, positioned by score. ${formatNumber(counts.installed)} installed, ${formatNumber(counts.active)} active.`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onClick={onClick}
      />
      {hover ? (
        <div
          className={styles.tooltip}
          style={{ left: Math.max(8, Math.min(hover.x + 14, size.w - 260)), top: Math.max(8, hover.y - 58) }}
        >
          <span className={styles.ttName}>{hover.skill.name}</span>
          <span className={`${styles.ttMeta} mono`}>
            {categoryLabel(hover.skill.category)} · score {Math.round(hover.skill.total)} · {hover.skill.status}
            {hover.skill.active ? " · active" : hover.skill.installed ? " · installed" : ""}
          </span>
          <span className={styles.ttDesc}>{clampText(hover.skill.description, 110)}</span>
        </div>
      ) : null}
      {isPending ? <span className={styles.loading}>plotting {formatNumber(MAX_NODES)} samples…</span> : null}
      <div className={styles.legend} aria-hidden="true">
        <span className={styles.key}><span className={styles.dotInk} /> candidate</span>
        <span className={styles.key}><span className={styles.dotAccent} /> installed</span>
        <span className={styles.key}><span className={styles.ringAccent} /> active</span>
        <span className={styles.key}><span className={styles.crossCrit}>×</span> quarantined</span>
      </div>
    </div>
  )
}
