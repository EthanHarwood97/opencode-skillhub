import { computeCoverage, GOAL_PROFILES, type ProfileCoverage } from "../../../catalog/src/coverage.ts"
import type { StoreLayout } from "../paths.ts"
import { readCatalog } from "./read.ts"

export function runCoverage(l: StoreLayout, profileId?: string): ProfileCoverage[] {
  const index = readCatalog(l)
  const profiles = profileId ? [profileId] : GOAL_PROFILES.map((profile) => profile.id)
  return profiles.map((id) => computeCoverage(index.skills, id))
}

export function formatCoverage(results: ProfileCoverage[]): string {
  return results
    .map((result) => {
      if (result.gaps.length === 0) return `${result.profile} ${result.coverage}% — no gaps`
      const gaps = result.gaps.map((gap) => `${gap.category} (${gap.supply}/${gap.min})`).join(", ")
      return `${result.profile} ${result.coverage}% — gaps: ${gaps}`
    })
    .join("\n")
}
