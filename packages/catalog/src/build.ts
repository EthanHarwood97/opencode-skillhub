import { normalizeCandidate } from "./normalize.ts"
import { writeCatalog, type CatalogIndex } from "./publish.ts"
import type { SkillRecord } from "./types.ts"
import type { Candidate } from "./sources/types.ts"

export type BuildSummary = {
  total: number
  published: number
  quarantined: number
  rejected: { name: string; reason: string }[]
}

export function buildCatalog(opts: { candidates: Candidate[]; outDir: string; now?: Date }): {
  summary: BuildSummary
  index: CatalogIndex
} {
  const now = opts.now ?? new Date()
  const records: SkillRecord[] = []
  const rejected: BuildSummary["rejected"] = []
  const seen = new Set<string>()

  for (const candidate of opts.candidates) {
    const result = normalizeCandidate(candidate, { now })
    if (result.record) {
      if (seen.has(result.record.id)) {
        rejected.push({ name: candidate.name, reason: `duplicate id ${result.record.id}` })
        continue
      }
      seen.add(result.record.id)
      records.push(result.record)
    } else if (result.rejected) rejected.push({ name: candidate.name, reason: result.rejected.reason })
  }

  const index = writeCatalog(records, opts.outDir, now).index
  return {
    summary: {
      total: opts.candidates.length,
      published: records.filter((r) => r.status === "candidate").length,
      quarantined: records.filter((r) => r.status === "quarantined").length,
      rejected,
    },
    index,
  }
}
