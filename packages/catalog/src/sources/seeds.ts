import type { Candidate, FetchLike } from "./types.ts"
import { fetchRepo, fetchRepoSkills } from "./github.ts"
import { RateLimitError } from "./util.ts"

export type SeedRepo = { repo: string; category?: string; labels?: string[]; maxSkills?: number }

/**
 * Load skills from a curated seed list of high-density skill repos
 * (awesome-style collections and official skill sets). Failures are warnings, never fatal.
 */
export async function fetchSeedRepos(opts: {
  seeds: SeedRepo[]
  token?: string
  fetchImpl: FetchLike
  maxSkills?: number
}): Promise<{ candidates: Candidate[]; warnings: string[] }> {
  const warnings: string[] = []
  const candidates: Candidate[] = []
  for (const seed of opts.seeds) {
    if (!seed.repo || !/^[^/\s]+\/[^/\s]+$/.test(seed.repo)) {
      warnings.push(`invalid seed repo "${seed.repo}"`)
      continue
    }
    try {
      const info = await fetchRepo({ repo: seed.repo, token: opts.token, fetchImpl: opts.fetchImpl })
      if (info.archived) {
        warnings.push(`${seed.repo}: archived`)
        continue
      }
      const skills = await fetchRepoSkills({
        repo: seed.repo,
        ref: info.defaultBranch,
        token: opts.token,
        fetchImpl: opts.fetchImpl,
        license: info.license,
        // Curated seeds are hand-picked: repos without a detectable SPDX license pass the gate
        // as explicit unknown-license (same convention as the marketplace source). Topic sweeps stay strict.
        licenseFlags: info.license ? [] : ["unknown-license"],
        signals: info.signals,
        maxSkills: seed.maxSkills ?? opts.maxSkills,
        categoryHint: seed.category,
        labelHints: seed.labels,
      })
      candidates.push(...skills)
    } catch (error) {
      if (error instanceof RateLimitError) throw error
      warnings.push(`${seed.repo}: ${error instanceof Error ? error.message : String(error)}`)
      if (warnings.length > 20) {
        warnings.push("too many seed failures — stopping seed sweep")
        break
      }
    }
  }
  return { candidates, warnings }
}
