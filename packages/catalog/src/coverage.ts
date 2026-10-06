import type { SkillRecord } from "./types.ts"

export type GoalProfile = { id: string; weights: Record<string, number>; bar: number; min: number }

export const GOAL_PROFILES: GoalProfile[] = [
  {
    id: "coding",
    bar: 60,
    min: 3,
    weights: { engineering: 0.28, testing: 0.15, "infrastructure-devops": 0.15, security: 0.1, ai: 0.1, data: 0.1, "docs-productivity": 0.07, research: 0.05 },
  },
  {
    id: "content",
    bar: 60,
    min: 3,
    weights: { writing: 0.3, "marketing-growth": 0.2, "design-ui": 0.15, media: 0.15, "art-creative": 0.1, research: 0.1 },
  },
  {
    id: "research",
    bar: 60,
    min: 3,
    weights: { research: 0.35, data: 0.2, ai: 0.15, writing: 0.15, "docs-productivity": 0.1, engineering: 0.05 },
  },
  {
    id: "business-ops",
    bar: 60,
    min: 3,
    weights: { "business-ops": 0.45, "marketing-growth": 0.2, product: 0.1, data: 0.1, "docs-productivity": 0.1, communication: 0.05 },
  },
  {
    id: "design-creative",
    bar: 60,
    min: 3,
    weights: { "design-ui": 0.4, "art-creative": 0.25, media: 0.2, writing: 0.1, engineering: 0.05 },
  },
  {
    id: "ai-builder",
    bar: 60,
    min: 3,
    weights: { ai: 0.4, engineering: 0.2, data: 0.15, integrations: 0.1, testing: 0.1, security: 0.05 },
  },
  {
    id: "game-dev",
    bar: 60,
    min: 3,
    weights: { games: 0.5, "art-creative": 0.15, engineering: 0.15, media: 0.1, writing: 0.1 },
  },
]

export type CategoryCoverage = {
  category: string
  weight: number
  supply: number
  min: number
  top: { id: string; name: string; total: number }[]
}

export type ProfileCoverage = {
  profile: string
  coverage: number
  categories: CategoryCoverage[]
  gaps: CategoryCoverage[]
}

export function computeCoverage(records: SkillRecord[], profileId: string, opts: { bar?: number; min?: number } = {}): ProfileCoverage {
  const profile = GOAL_PROFILES.find((candidate) => candidate.id === profileId)
  if (!profile) throw new Error(`unknown profile: ${profileId}`)
  const bar = opts.bar ?? profile.bar
  const min = opts.min ?? profile.min
  const categories = Object.entries(profile.weights)
    .sort(([leftCategory, leftWeight], [rightCategory, rightWeight]) => rightWeight - leftWeight || leftCategory.localeCompare(rightCategory))
    .map(([category, weight]) => {
      const candidates = records.filter((record) => record.category === category && record.status === "candidate")
      const top = candidates
        .slice()
        .sort((a, b) => b.scores.total - a.scores.total || a.id.localeCompare(b.id))
        .slice(0, 3)
        .map((record) => ({ id: record.id, name: record.name, total: record.scores.total }))
      const supply = candidates.filter((record) => record.scores.total >= bar).length
      return { category, weight, supply, min, top }
    })
  const coverage = categories.reduce((sum, entry) => sum + entry.weight * (min <= 0 ? 1 : Math.min(1, entry.supply / min)), 0)
  return {
    profile: profileId,
    coverage: Math.round(coverage * 100),
    categories,
    gaps: categories.filter((entry) => entry.supply < min),
  }
}
