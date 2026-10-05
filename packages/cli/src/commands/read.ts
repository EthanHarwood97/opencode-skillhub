import type { CatalogIndex } from "../../../catalog/src/publish.ts"
import type { SkillRecord } from "../../../catalog/src/types.ts"
import { readCatalogIndex } from "../catalog-cache.ts"
import type { StoreLayout } from "../paths.ts"

export function readCatalog(l: StoreLayout): CatalogIndex {
  return readCatalogIndex(l.catalogDir)
}

export function findRecord(index: CatalogIndex, id: string): SkillRecord | undefined {
  return index.skills.find((s) => s.id === id)
}

export function whyLines(record: SkillRecord): string[] {
  const s = record.scores
  return [
    `${record.id} — total ${s.total} (rubric ${s.rubricVersion}, evaluated ${s.evaluatedAt})`,
    `  quality ${s.quality} · trust ${s.trust} · freshness ${s.freshness} · compatibility ${s.compatibility} · adoption ${s.adoption}`,
    ...s.reasons.map((r) => `  - ${r}`),
  ]
}

export function formatHit(hit: { id: string; name: string; total: number; category: string; risk: string; status: string }): string {
  return `${hit.id}  [${hit.total}] ${hit.category} risk=${hit.risk} status=${hit.status}`
}
