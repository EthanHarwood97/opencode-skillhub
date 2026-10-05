export function formatNumber(value: number): string {
  return value.toLocaleString("en-US")
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KiB", "MiB", "GiB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

export function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return "unknown"
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return "unknown"
  const minutes = Math.round((now.getTime() - then) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return "yesterday"
  return `${days} days ago`
}

const CATEGORY_LABELS: Record<string, string> = {
  engineering: "Engineering",
  testing: "Testing",
  "design-ui": "Design & UI",
  writing: "Writing",
  data: "Data",
  research: "Research",
  "marketing-growth": "Marketing & Growth",
  "business-finance": "Business & Finance",
  "docs-productivity": "Docs & Productivity",
  security: "Security",
  "media-creative": "Media & Creative",
  "infrastructure-devops": "Infrastructure & DevOps",
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const STATUS_LABELS: Record<string, string> = {
  candidate: "Library",
  active: "Active",
  quarantined: "Quarantined",
  blocked: "Blocked",
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

export function riskTone(risk: string): "low" | "medium" | "high" | "critical" {
  return risk === "medium" || risk === "high" || risk === "critical" ? risk : "low"
}

export function clampText(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
