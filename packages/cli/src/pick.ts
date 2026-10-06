import type { SkillRecord } from "../../catalog/src/types.ts"
import type { CatalogIndex } from "../../catalog/src/publish.ts"
import type { Lockfile } from "./lockfile.ts"

export type BestPick = { category: string; id: string; name: string; total: number; risk: string }
export type BestPickResult = {
  perCategory: number
  picks: BestPick[]
  covered: { category: string; installed: number }[]
}

const RISK_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }

/**
 * Top up each category to `perCategory` installed skills with the best candidates.
 * Rank: score desc, then risk asc, then id. Quarantined skills are never picked.
 */
export function pickBestPerCategory(index: CatalogIndex, lock: Lockfile, opts: { perCategory?: number } = {}): BestPickResult {
  const perCategory = Math.max(1, Math.floor(opts.perCategory ?? 1))
  // Never suggest a skill whose name is already installed under any id (opencode dedupes by
  // name and would warn/skip; this also protects locally adopted skills).
  const takenNames = new Set(Object.keys(lock.skills).map((id) => id.split("/").at(-1) ?? id))
  const categories = new Map<string, { installed: number; candidates: SkillRecord[] }>()
  for (const record of index.skills) {
    const entry = categories.get(record.category) ?? { installed: 0, candidates: [] }
    if (lock.skills[record.id]) entry.installed += 1
    else if (record.status === "candidate" && !takenNames.has(record.name)) entry.candidates.push(record)
    categories.set(record.category, entry)
  }

  const picks: BestPick[] = []
  const covered: { category: string; installed: number }[] = []
  for (const [category, entry] of [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const want = perCategory - entry.installed
    if (want <= 0) {
      covered.push({ category, installed: entry.installed })
      continue
    }
    entry.candidates.sort(
      (a, b) =>
        b.scores.total - a.scores.total ||
        (RISK_ORDER[a.risk.level] ?? 9) - (RISK_ORDER[b.risk.level] ?? 9) ||
        a.id.localeCompare(b.id),
    )
    for (const record of entry.candidates.slice(0, want)) {
      picks.push({ category, id: record.id, name: record.name, total: record.scores.total, risk: record.risk.level })
    }
  }
  return { perCategory, picks, covered }
}
