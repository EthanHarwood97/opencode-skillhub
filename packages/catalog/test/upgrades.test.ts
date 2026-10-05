import { describe, expect, it } from "vitest"
import { computeUpgradeSuggestions } from "../src/upgrades.ts"
import { makeRecord } from "./helpers.ts"

const rec = (id: string, over: Partial<Parameters<typeof makeRecord>[0]> = {}) =>
  makeRecord({ id, clusterId: "c-1", status: "candidate", scores: { ...makeRecord({ id }).scores, total: 60 }, ...over })

describe("computeUpgradeSuggestions", () => {
  it("suggests a better same-cluster candidate for an active skill", () => {
    const records = [rec("a/old", { scores: { ...rec("a/old").scores, total: 60 } }), rec("a/new", { scores: { ...rec("a/new").scores, total: 78 } })]
    const out = computeUpgradeSuggestions(records, [{ id: "a/old", total: 55, active: true }])
    expect(out).toEqual([{ from: "a/old", to: "a/new", fromTotal: 55, toTotal: 78, clusterId: "c-1" }])
  })

  it("respects the margin, quarantine, and different clusters", () => {
    const records = [
      rec("a/old"),
      rec("a/thin", { scores: { ...rec("a/thin").scores, total: 59 } }), // below 55 + 5
      rec("a/quarantined", { status: "quarantined", scores: { ...rec("a/quarantined").scores, total: 90 } }),
      rec("a/other-cluster", { clusterId: "c-2", scores: { ...rec("a/other-cluster").scores, total: 90 } }),
    ]
    expect(computeUpgradeSuggestions(records, [{ id: "a/old", total: 55, active: true }])).toEqual([])
  })

  it("ignores inactive installs and missing records, dedupes to the best target, sorts and caps", () => {
    const records = [
      rec("a/old", { scores: { ...rec("a/old").scores, total: 60 } }),
      rec("a/mid", { scores: { ...rec("a/mid").scores, total: 70 } }),
      rec("a/best", { scores: { ...rec("a/best").scores, total: 90 } }),
    ]
    const out = computeUpgradeSuggestions(records, [{ id: "a/old", total: 50, active: true }], { limit: 5 })
    expect(out.map((s) => s.to)).toEqual(["a/best"])
    expect(computeUpgradeSuggestions(records, [{ id: "a/old", total: 50, active: false }])).toEqual([])
    expect(computeUpgradeSuggestions(records, [{ id: "a/ghost", total: 50, active: true }])).toEqual([])
  })

  it("is deterministic on ties and applies the default limit of 3", () => {
    const records = [rec("a/old"), rec("a/b"), rec("a/a"), rec("a/c"), rec("a/d")].map((r) => ({ ...r, scores: { ...r.scores, total: 90 } }))
    const installed = [
      { id: "a/old", total: 50, active: true },
      { id: "a/old2", total: 50, active: true },
      { id: "a/old3", total: 50, active: true },
      { id: "a/old4", total: 50, active: true },
    ]
    const rows = records.concat([rec("a/old2"), rec("a/old3"), rec("a/old4")])
    const out = computeUpgradeSuggestions(rows, installed, { margin: 1 })
    expect(out).toHaveLength(3)
    for (const suggestion of out) expect(suggestion.to).toBe("a/a")
  })
})
