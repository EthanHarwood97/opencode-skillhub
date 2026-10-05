import { GoldenSetSchema, type GoldenSet } from "./calibrate.ts"
import type { SkillRecord } from "./types.ts"

const HEADER = "id\tname\tcategory\tcluster\tscore\ttier\tnotes"

/** Deterministic, score-range-spread sample of candidates for a human labeling session. */
export function sampleForLabeling(records: SkillRecord[], limit: number): SkillRecord[] {
  const candidates = records
    .filter((r) => r.status === "candidate")
    .sort((a, b) => b.scores.total - a.scores.total || a.id.localeCompare(b.id))
  if (limit <= 0) return []
  if (candidates.length <= limit) return candidates
  if (limit === 1) return [candidates[0]!]
  const step = (candidates.length - 1) / (limit - 1)
  const out: SkillRecord[] = []
  for (let i = 0; i < limit; i++) out.push(candidates[Math.floor(i * step)]!)
  return out
}

export function labelTemplateTsv(records: SkillRecord[]): string {
  const rows = records.map((r) => [r.id, r.name, r.category, r.clusterId, String(r.scores.total), "", ""].join("\t"))
  return [HEADER, ...rows].join("\n") + "\n"
}

/** Parse a filled worksheet. Tier 1 = best. Blank tiers are skipped; invalid tiers throw. */
export function parseLabelTsv(tsv: string): GoldenSet {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const labels: GoldenSet["labels"] = []
  for (const [index, line] of lines.entries()) {
    const cells = line.split("\t")
    if (index === 0 && cells[0] === "id") continue
    const id = cells[0]?.trim() ?? ""
    const tierRaw = cells[5]?.trim() ?? ""
    if (!id || tierRaw === "") continue
    const tier = Number(tierRaw)
    if (![1, 2, 3, 4].includes(tier)) throw new Error(`invalid tier "${tierRaw}" for ${id} (expected 1-4)`)
    labels.push({ id, tier: tier as 1 | 2 | 3 | 4 })
  }
  return GoldenSetSchema.parse({ version: 1, labels })
}
