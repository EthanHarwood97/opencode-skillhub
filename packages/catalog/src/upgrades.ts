import type { SkillRecord } from "./types.ts"

export type InstalledEntry = { id: string; total: number; active: boolean; pinned?: boolean }

export type UpgradeSuggestion = {
  from: string
  to: string
  fromTotal: number
  toTotal: number
  clusterId: string
}

/** Active skills that a better-ranked same-cluster, same-category candidate outranks by `margin`. */
export function computeUpgradeSuggestions(
  records: SkillRecord[],
  installed: InstalledEntry[],
  opts: { margin?: number; limit?: number } = {},
): UpgradeSuggestion[] {
  const margin = opts.margin ?? 5
  const limit = opts.limit ?? 3
  const byId = new Map(records.map((record) => [record.id, record]))
  const suggestions: UpgradeSuggestion[] = []
  for (const entry of installed) {
    if (!entry.active || entry.pinned) continue
    const current = byId.get(entry.id)
    if (!current) continue
    // Locally adopted skills are managed by `skillhub adopt`; suggestions never target them.
    if (current.source.kind === "local") continue
    let best: SkillRecord | undefined
    for (const record of records) {
      if (record.status !== "candidate" || record.source.kind === "local" || record.category !== current.category || record.clusterId !== current.clusterId || record.id === current.id) continue
      if (record.scores.total < entry.total + margin) continue
      if (!best || record.scores.total > best.scores.total || (record.scores.total === best.scores.total && record.id.localeCompare(best.id) < 0)) {
        best = record
      }
    }
    if (best) suggestions.push({ from: entry.id, to: best.id, fromTotal: entry.total, toTotal: best.scores.total, clusterId: current.clusterId })
  }
  return suggestions.sort((a, b) => b.toTotal - a.toTotal || a.from.localeCompare(b.from)).slice(0, limit)
}
