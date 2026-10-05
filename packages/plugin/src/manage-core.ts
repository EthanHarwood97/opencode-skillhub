export { usageFileFor, readUsage, recordLoad, recordSearch, type Usage } from "./usage.ts"

export type ActiveAdvert = { id: string; name: string; description: string }

export function estimateAdvertisedTokens(adverts: ActiveAdvert[]): number {
  const chars = adverts.reduce((n, a) => n + a.name.length + a.description.length + 140, 0)
  return Math.ceil(chars / 4)
}

export function enforceBudget(input: {
  adverts: ActiveAdvert[]
  uses: Record<string, number>
  cap: number
}): { keep: string[]; demote: string[] } {
  const ranked = [...input.adverts].sort(
    (a, b) => (input.uses[b.id] ?? 0) - (input.uses[a.id] ?? 0) || a.id.localeCompare(b.id),
  )
  const keep: string[] = []
  const demote: string[] = []
  let used = 0
  for (const advert of ranked) {
    const cost = estimateAdvertisedTokens([advert])
    if (used + cost <= input.cap) {
      keep.push(advert.id)
      used += cost
    } else {
      demote.push(advert.id)
    }
  }
  return { keep, demote }
}

export function promotionCandidates(input: {
  lock: { skills: Record<string, { active: boolean }> }
  usage: { loads: Record<string, { count: number }> }
  threshold?: number
}): { id: string; uses: number }[] {
  const threshold = input.threshold ?? 3
  return Object.entries(input.lock.skills)
    .filter(([id, entry]) => !entry.active && (input.usage.loads[id]?.count ?? 0) >= threshold)
    .map(([id]) => ({ id, uses: input.usage.loads[id]!.count }))
    .sort((a, b) => b.uses - a.uses || a.id.localeCompare(b.id))
}
