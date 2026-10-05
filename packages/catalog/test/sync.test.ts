import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { RubricEvaluation } from "../src/rubric.ts"
import type { Candidate } from "../src/sources/types.ts"
import { syncCatalog } from "../src/sync.ts"

const now = new Date("2026-10-05T00:00:00Z")
const qualityOnly = { quality: 1, trust: 0, freshness: 0, compatibility: 0, adoption: 0 }

const skill = (name: string, repo: string): Candidate => {
  const body = `---\nname: ${name}\ndescription: A skill for ${name}. Use when testing.\nrepo: ${repo}\n---\n\n# ${name}\n\n## When to use\n\nUse when testing.\n\n## Workflow\n\n1. Do it.\n\n\`\`\`bash\necho ok\n\`\`\`\n`
  return {
    source: { kind: "github", repo, path: `${name}/SKILL.md`, ref: "abc123", license: "MIT", licenseFlags: [] },
    name,
    dir: name,
    tags: [name.split("-")[0]!],
    signals: { stars: 10, pushedAt: "2026-09-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
    files: [{ path: `${name}/SKILL.md`, content: body, size: Buffer.byteLength(body) }],
  }
}

const evaluation = (score: number): RubricEvaluation => ({
  result: {
    score,
    dimensions: { triggers: score, clarity: score, structure: score, completeness: score, scope: score, examples: score, safety: score },
    reasoning: "ok",
    flags: [],
  },
  usage: { inputTokens: 100, outputTokens: 10 },
  costUsd: 0.001,
  model: "m",
})

describe("syncCatalog", () => {
  it("runs sources -> evaluate -> cluster -> trend -> reconcile -> publish", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-sync-"))
    const outDir = join(root, "catalog")
    const stateDir = join(root, "state")
    const evaluatedIds: string[] = []

    const result = await syncCatalog({
      sources: [
        { name: "fixtures", load: async () => [skill("pdf-tool", "acme/skills"), skill("pdf-tool", "beta/skills"), skill("k8s-tool", "acme/skills")] },
        { name: "broken-source", load: async () => { throw new Error("boom") } },
      ],
      outDir,
      stateDir,
      now,
      weights: qualityOnly,
      evaluation: {
        evaluate: async (input) => {
          evaluatedIds.push(input.id)
          return evaluation(88)
        },
        maxEvals: 2,
        maxUsd: 1,
      },
    })

    expect(result.summary).toMatchObject({ candidates: 3, published: 3, rejected: 0, evaluated: 2, cached: 0, skippedBudget: 1, duplicates: 1 })
    expect(evaluatedIds).toEqual(["acme-skills/pdf-tool", "beta-skills/pdf-tool"])
    expect(result.index.skills.find((s) => s.id === "acme-skills/pdf-tool")!.scores.total).toBe(88)
    expect(result.index.skills.find((s) => s.id === "acme-skills/pdf-tool")!.relations.duplicates).toEqual(["beta-skills/pdf-tool"])
    expect(result.reconciliation.gaps).toEqual(["source broken-source: boom"])
    expect(result.reconciliation.reviewQueue).toContain("acme-skills/pdf-tool")
    expect(result.trending.topVelocity).toEqual([])
    expect(existsSync(join(outDir, "index.json"))).toBe(true)
    expect(existsSync(join(outDir, "trending.json"))).toBe(true)
    expect(existsSync(join(outDir, "reconciliation.json"))).toBe(true)
    expect(existsSync(join(stateDir, "eval-cache.json"))).toBe(true)
    expect(existsSync(join(stateDir, "clusters-state.json"))).toBe(true)
    expect(existsSync(join(stateDir, "snapshots", "2026-10-05.json"))).toBe(true)
  })

  it("serves the eval cache on a second run (delta-only)", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-sync2-"))
    const outDir = join(root, "catalog")
    const stateDir = join(root, "state")
    const sources = [{ name: "fixtures", load: async () => [skill("pdf-tool", "acme/skills"), skill("k8s-tool", "acme/skills")] }]
    await syncCatalog({ sources, outDir, stateDir, now, weights: qualityOnly, evaluation: { evaluate: async () => evaluation(70), maxEvals: 5, maxUsd: 1 } })
    const second = await syncCatalog({
      sources,
      outDir,
      stateDir,
      now,
      weights: qualityOnly,
      evaluation: {
        evaluate: async () => {
          throw new Error("evaluator must not run on cached content")
        },
        maxEvals: 0,
        maxUsd: 1,
      },
    })
    expect(second.summary).toMatchObject({ evaluated: 0, cached: 2, skippedBudget: 0 })
  })
})
