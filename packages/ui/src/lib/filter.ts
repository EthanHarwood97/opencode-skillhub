import type { SkillCard, SkillsPageDto, SkillsQuery } from "./contract.ts"

const DEFAULT_PAGE_SIZE = 48
const MAX_PAGE_SIZE = 200

export function filterSkills(cards: SkillCard[], query: SkillsQuery): SkillsPageDto {
  const terms = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1)

  const filtered = cards.filter((card) => {
    if (query.category && card.category !== query.category) return false
    if (query.status && card.status !== query.status) return false
    if (query.risk && card.risk !== query.risk) return false
    if (query.provenance && card.provenance !== query.provenance) return false
    if (query.cluster && card.clusterId !== query.cluster) return false
    for (const term of terms) {
      const haystack = `${card.id} ${card.name} ${card.description} ${card.tags.join(" ")} ${card.sourceRepo ?? ""}`.toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  })

  const sort = query.sort ?? "score"
  filtered.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    if (sort === "freshness") return b.freshness - a.freshness || b.total - a.total || a.id.localeCompare(b.id)
    return b.total - a.total || a.id.localeCompare(b.id)
  })

  const start = (page - 1) * pageSize
  return { total: filtered.length, page, pageSize, items: filtered.slice(start, start + pageSize) }
}
