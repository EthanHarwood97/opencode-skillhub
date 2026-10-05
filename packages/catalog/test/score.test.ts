import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DEFAULT_WEIGHTS, qualityHeuristic, rescoreWithQuality, scoreRecord } from "../src/score.ts"
import { parseSkillMd } from "../src/parse.ts"
import { SignalsSchema, SourceSchema } from "../src/types.ts"

const parsed = (name: string) =>
  parseSkillMd(readFileSync(new URL(`../../../fixtures/skills/${name}/SKILL.md`, import.meta.url), "utf8"))

const healthy = {
  parsed: parsed("good-skill"),
  risk: { level: "low" as const, findings: [] },
  signals: SignalsSchema.parse({ pushedAt: "2026-09-01T00:00:00Z", stars: 120, installs: 500 }),
  filesPresent: [true],
  source: SourceSchema.parse({ kind: "github", repo: "a/b", path: "s/SKILL.md", license: "MIT" }),
  now: new Date("2026-10-05T00:00:00Z"),
}

describe("qualityHeuristic", () => {
  it("rewards trigger phrasing and structure", () => {
    expect(qualityHeuristic(healthy.parsed).value).toBeGreaterThanOrEqual(60)
  })
})

describe("scoreRecord", () => {
  it("weights sum to 1", () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it("produces a bounded total with reasons", () => {
    const scores = scoreRecord(healthy)
    expect(scores.total).toBeGreaterThan(0)
    expect(scores.total).toBeLessThanOrEqual(100)
    expect(scores.reasons.length).toBeGreaterThan(3)
    expect(scores.rubricVersion).toBe("heuristic-v0")
  })

  it("punishes risk findings in trust", () => {
    const risky = scoreRecord({
      ...healthy,
      risk: { level: "high" as const, findings: [{ rule: "x", category: "shell", severity: "high", match: "x", line: 1 }] },
    })
    expect(risky.trust).toBeLessThan(scoreRecord(healthy).trust)
  })

  it("decays freshness for old pushes", () => {
    const stale = scoreRecord({
      ...healthy,
      signals: SignalsSchema.parse({ ...healthy.signals, pushedAt: "2024-01-01T00:00:00Z" }),
    })
    expect(stale.freshness).toBeLessThan(40)
  })

  it("keeps total finite for a malformed push date", () => {
    const scores = scoreRecord({
      ...healthy,
      signals: SignalsSchema.parse({ ...healthy.signals, pushedAt: "not-a-date" }),
    })
    expect(scores.freshness).toBe(10)
    expect(Number.isFinite(scores.total)).toBe(true)
  })

  it("keeps total finite for negative star/install counts", () => {
    const scores = scoreRecord({
      ...healthy,
      signals: SignalsSchema.parse({ ...healthy.signals, stars: -5, installs: -5 }),
    })
    expect(Number.isFinite(scores.total)).toBe(true)
    expect(scores.adoption).toBeGreaterThanOrEqual(0)
  })

  it("penalizes required scripts that are not bundled", () => {
    const missing = scoreRecord({ ...healthy, missingScripts: 2 })
    expect(missing.compatibility).toBeLessThan(scoreRecord(healthy).compatibility)
    expect(missing.compatibility).toBe(80)
  })

  it("rescores quality with the given weights and keeps other parts", () => {
    const base = scoreRecord(healthy)
    const updated = rescoreWithQuality({
      scores: base,
      quality: 100,
      reasons: ["quality: rubric-v1 100"],
      rubricVersion: "rubric-v1",
      evaluatedAt: "2026-10-05T01:00:00.000Z",
      weights: { quality: 1, trust: 0, freshness: 0, compatibility: 0, adoption: 0 },
    })
    expect(updated.total).toBe(100)
    expect(updated.trust).toBe(base.trust)
    expect(updated.reasons).toContain("quality: rubric-v1 100")
    expect(updated.rubricVersion).toBe("rubric-v1")
  })
})
