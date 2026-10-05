import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
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
    expect(result.index.skills.find((s) => s.id === "acme-skills/k8s-tool")!.scores.total).toBe(result.index.skills.find((s) => s.id === "acme-skills/k8s-tool")!.scores.quality)
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

  it("writes vector artifacts when an embedder is provided and warns (without failing) when it errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-sync-vec-"))
    const embedder = { name: "fake", model: "fake-1", dim: 3, embed: async (texts: string[]) => texts.map(() => Float32Array.from([1, 0, 0])) }
    const ok = await syncCatalog({
      sources: [{ name: "s", load: async () => [skill("pdf-tool", "acme/skills")] }],
      outDir: join(root, "catalog"),
      stateDir: join(root, "state"),
      now,
      vectors: { embedder },
    })
    expect(ok.vectors).toEqual({ embedded: 1, reused: 0, warnings: [] })
    expect(existsSync(join(root, "catalog", "vectors.json"))).toBe(true)
    expect(existsSync(join(root, "catalog", "vectors.bin"))).toBe(true)

    const failing = { ...embedder, embed: async () => { throw new Error("api down") } }
    mkdirSync(join(root, "catalog2"), { recursive: true })
    writeFileSync(join(root, "catalog2", "vectors.json"), "{}")
    writeFileSync(join(root, "catalog2", "vectors.bin"), "")
    const bad = await syncCatalog({
      sources: [{ name: "s", load: async () => [skill("pdf-tool", "acme/skills")] }],
      outDir: join(root, "catalog2"),
      stateDir: join(root, "state2"),
      now,
      vectors: { embedder: failing },
    })
    expect(bad.vectors?.warnings.join(" ")).toContain("api down")
    expect(bad.index.skills.length).toBeGreaterThan(0)
    expect(existsSync(join(root, "catalog2", "index.json"))).toBe(true)
    expect(existsSync(join(root, "catalog2", "vectors.json"))).toBe(false)
    expect(existsSync(join(root, "catalog2", "vectors.bin"))).toBe(false)
  })

  it("removes stale vector artifacts when a later sync runs without vectors", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-sync-novec-"))
    const embedder = { name: "fake", model: "fake-1", dim: 3, embed: async (texts: string[]) => texts.map(() => Float32Array.from([1, 0, 0])) }
    const sources = [{ name: "s", load: async () => [skill("pdf-tool", "acme/skills")] }]
    const outDir = join(root, "catalog")
    const stateDir = join(root, "state")
    await syncCatalog({ sources, outDir, stateDir, now, vectors: { embedder } })
    expect(existsSync(join(outDir, "vectors.json"))).toBe(true)
    expect(existsSync(join(outDir, "vectors.bin"))).toBe(true)

    const second = await syncCatalog({ sources, outDir, stateDir, now })
    expect(second.vectors).toBeUndefined()
    expect(existsSync(join(outDir, "vectors.json"))).toBe(false)
    expect(existsSync(join(outDir, "vectors.bin"))).toBe(false)
  })

  it("surfaces source warnings as reconciliation gaps", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-sync-warn-"))
    const result = await syncCatalog({
      sources: [
        { name: "fixtures", load: async () => ({ candidates: [skill("pdf-tool", "acme/skills")], warnings: ["repo x/y: boom"] }) },
      ],
      outDir: join(root, "catalog"),
      stateDir: join(root, "state"),
      now,
    })
    expect(result.reconciliation.gaps).toContain("source fixtures: repo x/y: boom")
  })
})
