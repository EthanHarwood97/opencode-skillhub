import { describe, expect, it } from "vitest"
import { computeCoverage, GOAL_PROFILES } from "../src/coverage.ts"
import { CATEGORIES } from "../src/taxonomy.ts"
import type { SkillRecord } from "../src/types.ts"
import { makeRecord } from "./helpers.ts"

const rec = (id: string, category: string, total: number, status: SkillRecord["status"] = "candidate") =>
  makeRecord({ id, category, status, scores: { ...makeRecord({ id }).scores, total } })

describe("GOAL_PROFILES", () => {
  it("weights sum to 1 and reference real categories", () => {
    for (const profile of GOAL_PROFILES) {
      const sum = Object.values(profile.weights).reduce((n, w) => n + w, 0)
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
      for (const category of Object.keys(profile.weights)) expect(CATEGORIES).toContain(category)
    }
    expect(GOAL_PROFILES.map((p) => p.id)).toEqual(["coding", "content", "research", "business-ops", "design-creative", "ai-builder", "game-dev"])
  })
})

describe("computeCoverage", () => {
  it("scores full weight when a category meets its minimum", () => {
    const records = ["a/1", "a/2", "a/3"].map((id, i) => rec(id, "engineering", 70 + i))
    const result = computeCoverage(records, "coding")
    expect(result.gaps.every((gap) => gap.category !== "engineering")).toBe(true)
    expect(result.categories.find((c) => c.category === "engineering")!.supply).toBe(3)
  })

  it("scales partial supply, reports gaps in weight order, and lists tops below the bar", () => {
    const records = [rec("a/1", "engineering", 65), rec("a/2", "testing", 40), rec("a/2b", "testing", 55)]
    const result = computeCoverage(records, "coding")
    const testing = result.categories.find((c) => c.category === "testing")!
    expect(testing.supply).toBe(0)
    expect(testing.top.map((t) => t.id)).toEqual(["a/2b", "a/2"])
    expect(result.gaps.map((g) => g.category)).toContain("testing")
    expect(result.coverage).toBeGreaterThan(0)
    expect(result.coverage).toBeLessThan(100)
  })

  it("throws for an unknown profile and supports bar/min overrides", () => {
    expect(() => computeCoverage([], "nope")).toThrow(/unknown profile/)
    const records = [rec("a/1", "engineering", 50)]
    expect(computeCoverage(records, "coding").coverage).toBe(0)
    expect(computeCoverage(records, "coding", { bar: 50, min: 1 }).coverage).toBe(28)
  })

  it("reports 100 and no gaps when every weighted category meets the minimum", () => {
    const coding = GOAL_PROFILES.find((p) => p.id === "coding")!
    const records = Object.keys(coding.weights).flatMap((category) =>
      ["1", "2", "3"].map((id) => rec(`${category}/${id}`, category, 70)),
    )
    const result = computeCoverage(records, "coding")
    expect(result.coverage).toBe(100)
    expect(result.gaps).toEqual([])
  })

  it("orders tops by total desc then id asc, caps at 3, and counts only candidates", () => {
    const records = [
      rec("z/late", "engineering", 80),
      rec("a/first", "engineering", 80),
      rec("b/mid", "engineering", 90),
      rec("c/low", "engineering", 70),
      rec("d/active", "engineering", 99, "active"),
    ]
    const result = computeCoverage(records, "coding")
    const engineering = result.categories.find((c) => c.category === "engineering")!
    expect(engineering.top.map((t) => t.id)).toEqual(["b/mid", "a/first", "z/late"])
    expect(engineering.supply).toBe(4)
  })
})
