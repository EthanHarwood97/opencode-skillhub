import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { evalKey, readEvalCache, writeEvalCache } from "../src/eval-cache.ts"
import { evaluateRecords } from "../src/evaluate.ts"
import { RUBRIC_VERSION, type RubricEvaluation } from "../src/rubric.ts"
import { makeRecord } from "./helpers.ts"

const evaluation = (score: number, costUsd = 0.002): RubricEvaluation => ({
  result: {
    score,
    dimensions: { triggers: score, clarity: score, structure: score, completeness: score, scope: score, examples: score, safety: score },
    reasoning: `score ${score}`,
    flags: [],
  },
  usage: { inputTokens: 1_000, outputTokens: 100 },
  costUsd,
  model: "test-model",
})

const qualityOnly = { quality: 1, trust: 0, freshness: 0, compatibility: 0, adoption: 0 }

describe("eval cache", () => {
  it("round-trips and defaults to empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-eval-"))
    const file = join(dir, "state", "eval-cache.json")
    expect(readEvalCache(file)).toEqual({ version: 1, entries: {} })
    writeEvalCache(file, {
      version: 1,
      entries: {
        [evalKey("a", "v")]: { contentHash: "a", rubricVersion: "v", score: 1, dimensions: {}, reasoning: "r", flags: [], model: "m", costUsd: 0, evaluatedAt: "t" },
      },
    })
    expect(readEvalCache(file).entries[evalKey("a", "v")]?.score).toBe(1)
  })
})

describe("evaluateRecords", () => {
  it("evaluates misses, serves cache hits, respects the budget and skips quarantined", async () => {
    const miss = makeRecord({ id: "a/miss", contentHash: "h1" })
    const cached = makeRecord({ id: "a/cached", contentHash: "h2" })
    const budget = makeRecord({ id: "a/budget", contentHash: "h3" })
    const quarantined = makeRecord({ id: "a/q", contentHash: "h4", status: "quarantined" })
    const cache = {
      version: 1 as const,
      entries: {
        [evalKey("h2", RUBRIC_VERSION)]: { contentHash: "h2", rubricVersion: RUBRIC_VERSION, score: 77, dimensions: {}, reasoning: "cached", flags: [], model: "m", costUsd: 0, evaluatedAt: "2026-01-01T00:00:00.000Z" },
      },
    }
    const calls: string[] = []
    const { records, stats, cache: out } = await evaluateRecords([miss, cached, budget, quarantined], {
      cache,
      bodies: new Map([["a/miss", "# M"], ["a/cached", "# C"], ["a/budget", "# B"]]),
      evaluate: async (input) => {
        calls.push(input.id)
        return evaluation(88)
      },
      maxEvals: 1,
      maxUsd: 1,
      weights: qualityOnly,
      now: new Date("2026-10-05T00:00:00Z"),
    })
    expect(calls).toEqual(["a/miss"])
    expect(stats).toMatchObject({ evaluated: 1, cached: 1, skippedBudget: 1, skippedQuarantined: 1 })
    expect(records[0]!.scores.total).toBe(88)
    expect(records[1]!.scores.total).toBe(77)
    expect(records[2]!.scores.reasons.join(" ")).toMatch(/budget/)
    expect(out.entries[evalKey("h1", RUBRIC_VERSION)]?.score).toBe(88)
  })

  it("stops when the dollar cap would be exceeded", async () => {
    const a = makeRecord({ id: "a/a", contentHash: "ha" })
    const b = makeRecord({ id: "a/b", contentHash: "hb" })
    const { stats } = await evaluateRecords([a, b], {
      cache: { version: 1, entries: {} },
      bodies: new Map([["a/a", "#"], ["a/b", "#"]]),
      evaluate: async () => evaluation(50, 0.02),
      maxUsd: 0.03,
      costPerEvalUsd: 0.02,
      now: new Date("2026-10-05T00:00:00Z"),
    })
    expect(stats.evaluated).toBe(1)
    expect(stats.skippedBudget).toBe(1)
    expect(stats.spentUsd).toBeCloseTo(0.02, 10)
  })

  it("backfills the best-scoring pending documents first", async () => {
    const base = makeRecord({ id: "t" }).scores
    const low = makeRecord({ id: "a/low", contentHash: "hl", scores: { ...base, total: 30 } })
    const high = makeRecord({ id: "a/high", contentHash: "hh", scores: { ...base, total: 90 } })
    const calls: string[] = []
    await evaluateRecords([low, high], {
      cache: { version: 1, entries: {} },
      bodies: new Map([["a/low", "# L"], ["a/high", "# H"]]),
      evaluate: async (input) => {
        calls.push(input.id)
        return evaluation(70)
      },
      maxEvals: 1,
      now: new Date("2026-10-05T00:00:00Z"),
    })
    expect(calls).toEqual(["a/high"])
  })

  it("isolates a failed evaluation, keeps its heuristic score, and caches only successes", async () => {    const failed = makeRecord({ id: "a/fail", contentHash: "hf" })
    const ok = makeRecord({ id: "a/ok", contentHash: "ho" })
    const { records, stats, cache: out } = await evaluateRecords([failed, ok], {
      cache: { version: 1, entries: {} },
      bodies: new Map([["a/fail", "# F"], ["a/ok", "# O"]]),
      evaluate: async (input) => {
        if (input.id === "a/fail") throw new Error("429 rate limited")
        return evaluation(88)
      },
      weights: qualityOnly,
      now: new Date("2026-10-05T00:00:00Z"),
    })
    expect(stats).toMatchObject({ evaluated: 1, failed: 1 })
    expect(records[0]!.scores.total).toBe(50)
    expect(records[0]!.scores.reasons.join(" ")).toMatch(/evaluation failed \(429 rate limited\)/)
    expect(records[1]!.scores.total).toBe(88)
    expect(out.entries[evalKey("hf", RUBRIC_VERSION)]).toBeUndefined()
    expect(out.entries[evalKey("ho", RUBRIC_VERSION)]?.score).toBe(88)
  })
})
