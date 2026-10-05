export type SearchRow = {
  id: string
  name: string
  description: string
  category: string
  total: number
  risk: string
  provenance: string
  status: string
}

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

export function buildFtsQuery(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, "")}"`)
    .join(" ")
}

export function formatHits(rows: SearchRow[], limit = 5): string {
  if (rows.length === 0) return "No matching skills."
  return rows
    .slice(0, limit)
    .map((r) => `${r.id} [${r.total}] ${r.category} risk=${r.risk} ${r.provenance} — ${r.description.slice(0, 120)}`)
    .join("\n")
}

export const CAPABILITY_MAP: string[] = [
  "PDF/document manipulation",
  "spreadsheets & data cleaning",
  "word docs & reports",
  "web design & frontend engineering",
  "SEO, keywords & content strategy",
  "marketing, ads & growth",
  "business, finance & legal ops",
  "research & evidence gathering",
  "testing & QA",
  "security & supply chain",
  "infrastructure & DevOps",
  "Cloudflare/Workers",
  "database & Postgres",
  "writing, editing & copy",
  "agent/skill authoring",
]

export const ROUTER_DESCRIPTION = [
  "Search the SkillHub library (tens of thousands of agent skills) for the best skill for the current task.",
  "Call this BEFORE non-trivial tasks to check whether a specialized skill exists; then call skillhub_load with the chosen id.",
  "Library covers: " + CAPABILITY_MAP.join("; ") + ".",
  "Returns top-5 matches with score, category, risk, and provenance; bodies are never returned here.",
].join("\n")
