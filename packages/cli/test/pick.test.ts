import { describe, expect, it } from "vitest"
import { makeRecord } from "../../catalog/test/helpers.ts"
import type { CatalogIndex } from "../../catalog/src/publish.ts"
import type { Lockfile } from "../src/lockfile.ts"
import { pickBestPerCategory } from "../src/pick.ts"

const index = (skills: ReturnType<typeof makeRecord>[]): CatalogIndex =>
  ({ version: 1, generatedAt: "", counts: { total: skills.length, byStatus: {}, byCategory: {} }, skills }) as CatalogIndex

const lock = (ids: string[] = []): Lockfile => ({
  version: 1,
  skills: Object.fromEntries(ids.map((id) => [id, { id, contentHash: "h", provenanceTier: "local", installedAt: "", files: [], active: true, riskLevel: "low", total: 50 }])),
})

describe("pickBestPerCategory", () => {
  it("picks the top-scoring candidate per category and reports covered ones", () => {
    const result = pickBestPerCategory(
      index([
        makeRecord({ id: "a/games-low", category: "games", scores: { ...makeRecord({ id: "x" }).scores, total: 60 } }),
        makeRecord({ id: "a/games-high", category: "games", scores: { ...makeRecord({ id: "x" }).scores, total: 90 } }),
        makeRecord({ id: "a/writing-1", category: "writing", scores: { ...makeRecord({ id: "x" }).scores, total: 70 } }),
        makeRecord({ id: "a/covered", category: "data" }),
      ]),
      lock(["a/covered"]),
    )
    expect(result.perCategory).toBe(1)
    expect(result.picks.map((pick) => pick.id)).toEqual(["a/games-high", "a/writing-1"])
    expect(result.covered).toEqual([{ category: "data", installed: 1 }])
  })

  it("tops each category up to perCategory", () => {
    const result = pickBestPerCategory(
      index([
        makeRecord({ id: "a/one", category: "games", scores: { ...makeRecord({ id: "x" }).scores, total: 90 } }),
        makeRecord({ id: "a/two", category: "games", scores: { ...makeRecord({ id: "x" }).scores, total: 80 } }),
        makeRecord({ id: "a/three", category: "games", scores: { ...makeRecord({ id: "x" }).scores, total: 70 } }),
      ]),
      lock(["a/one"]),
      { perCategory: 2 },
    )
    expect(result.picks.map((pick) => pick.id)).toEqual(["a/two"])
    expect(result.covered).toEqual([])
  })

  it("never picks quarantined skills and prefers lower risk on score ties", () => {
    const result = pickBestPerCategory(
      index([
        makeRecord({ id: "a/quarantined", category: "security", status: "quarantined", scores: { ...makeRecord({ id: "x" }).scores, total: 99 } }),
        makeRecord({ id: "a/high-risk", category: "security", risk: { level: "high", findings: [] } }),
        makeRecord({ id: "a/low-risk", category: "security", risk: { level: "low", findings: [] } }),
      ]),
      lock(),
    )
    expect(result.picks).toEqual([{ category: "security", id: "a/low-risk", name: "low-risk", total: 50, risk: "low" }])
  })

  it("returns nothing when every category is already covered", () => {
    const result = pickBestPerCategory(index([makeRecord({ id: "a/only", category: "games" })]), lock(["a/only"]))
    expect(result.picks).toEqual([])
    expect(result.covered).toEqual([{ category: "games", installed: 1 }])
  })
})
