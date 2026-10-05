import type { SkillRecord } from "./types.ts"

export type SourceStat = { source: string; candidates: number; fetchedAt: string; error?: string }

export type ReconciliationFile = {
  version: 1
  generatedAt: string
  totals: { previous: number; current: number; added: string[]; removed: string[]; changed: string[] }
  sources: SourceStat[]
  gaps: string[]
  reviewQueue: string[]
}

export function reconcile(input: {
  previous?: { skills: SkillRecord[] }
  current: SkillRecord[]
  sourceStats: SourceStat[]
  now: Date
  reviewMinScore?: number
  reviewLimit?: number
}): ReconciliationFile {
  const previousSkills = input.previous?.skills ?? []
  const previousById = new Map(previousSkills.map((s) => [s.id, s]))
  const currentById = new Map(input.current.map((s) => [s.id, s]))

  const added = input.current.filter((s) => !previousById.has(s.id)).map((s) => s.id).sort()
  const removed = previousSkills.filter((s) => !currentById.has(s.id)).map((s) => s.id).sort()
  const changed = input.current
    .filter((s) => {
      const previous = previousById.get(s.id)
      return previous !== undefined && previous.contentHash !== s.contentHash
    })
    .map((s) => s.id)
    .sort()

  const gaps: string[] = []
  if (input.previous && input.current.length === 0 && previousSkills.length > 0) gaps.push("catalog emptied since the previous run")
  if (input.previous && previousSkills.length > 0 && added.length > previousSkills.length) {
    gaps.push(`catalog grew by more than 100% (${previousSkills.length} -> ${input.current.length}) — verify intake`)
  }
  for (const stat of input.sourceStats) if (stat.error) gaps.push(`source ${stat.source}: ${stat.error}`)

  const reviewMinScore = input.reviewMinScore ?? 60
  const reviewLimit = input.reviewLimit ?? 20
  const addedSet = new Set(added)
  const reviewQueue = input.current
    .filter((s) => addedSet.has(s.id) && s.status === "candidate" && s.scores.total >= reviewMinScore)
    .sort((a, b) => b.scores.total - a.scores.total || a.id.localeCompare(b.id))
    .slice(0, reviewLimit)
    .map((s) => s.id)

  return {
    version: 1,
    generatedAt: input.now.toISOString(),
    totals: { previous: previousSkills.length, current: input.current.length, added, removed, changed },
    sources: [...input.sourceStats].sort((a, b) => a.source.localeCompare(b.source)),
    gaps,
    reviewQueue,
  }
}
