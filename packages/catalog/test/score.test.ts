import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DEFAULT_WEIGHTS, qualityHeuristic, scoreRecord } from "../src/score.ts"
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
})
