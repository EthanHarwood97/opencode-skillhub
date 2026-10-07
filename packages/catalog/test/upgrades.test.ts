import { describe, expect, it } from "vitest"
import { computeUpgradeSuggestions } from "../src/upgrades.ts"
import { makeRecord } from "./helpers.ts"

const github = { kind: "github" as const, repo: "acme/skills", path: "SKILL.md", ref: "abc123", license: "MIT", licenseFlags: [] }

const rec = (id: string, over: Partial<Parameters<typeof makeRecord>[0]> = {}) =>
  makeRecord({ id, clusterId: "c-1", status: "candidate", source: github, scores: { ...makeRecord({ id }).scores, total: 60 }, ...over })

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

  it("orders suggestions by toTotal descending", () => {
    const records = [
      rec("a/old1", { scores: { ...rec("a/old1").scores, total: 40 } }),
      rec("t1", { scores: { ...rec("t1").scores, total: 70 } }),
      rec("a/old2", { clusterId: "c-2", scores: { ...rec("a/old2").scores, total: 40 } }),
      rec("t2", { clusterId: "c-2", scores: { ...rec("t2").scores, total: 85 } }),
    ]
    const installed = [
      { id: "a/old1", total: 50, active: true },
      { id: "a/old2", total: 50, active: true },
    ]
    expect(computeUpgradeSuggestions(records, installed).map((s) => s.to)).toEqual(["t2", "t1"])
  })

  it("breaks equal toTotal ties by from id ascending", () => {
    const records = [
      rec("a/old1", { scores: { ...rec("a/old1").scores, total: 40 } }),
      rec("t1", { scores: { ...rec("t1").scores, total: 90 } }),
      rec("a/old2", { clusterId: "c-2", scores: { ...rec("a/old2").scores, total: 40 } }),
      rec("t2", { clusterId: "c-2", scores: { ...rec("t2").scores, total: 90 } }),
    ]
    const installed = [
      { id: "a/old2", total: 50, active: true },
      { id: "a/old1", total: 50, active: true },
    ]
    const out = computeUpgradeSuggestions(records, installed)
    expect(out.map((s) => s.from)).toEqual(["a/old1", "a/old2"])
    expect(out.map((s) => s.toTotal)).toEqual([90, 90])
  })

  it("never targets pinned installs or local records", () => {
    const records = [rec("a/old", { scores: { ...rec("a/old").scores, total: 40 } }), rec("a/new", { scores: { ...rec("a/new").scores, total: 90 } })]
    expect(computeUpgradeSuggestions(records, [{ id: "a/old", total: 50, active: true, pinned: true }])).toEqual([])
    expect(computeUpgradeSuggestions(records, [{ id: "a/old", total: 50, active: true }])).toHaveLength(1)

    const withLocal = [
      ...records,
      rec("local/mine", { source: { kind: "local", path: "SKILL.md", licenseFlags: [] }, scores: { ...rec("local/mine").scores, total: 30 } }),
      rec("a/local-target", { source: { kind: "local", path: "SKILL.md", licenseFlags: [] }, scores: { ...rec("a/local-target").scores, total: 95 } }),
    ]
    const out = computeUpgradeSuggestions(withLocal, [
      { id: "local/mine", total: 0, active: true },
      { id: "a/old", total: 50, active: true },
    ])
    expect(out.map((s) => s.from)).toEqual(["a/old"])
    expect(out.map((s) => s.to)).not.toContain("a/local-target")
  })

  it("rejects cross-category candidates even inside a broad shared cluster", () => {
    const records = [rec("a/old"), rec("a/other", { category: "writing", scores: { ...rec("a/other").scores, total: 95 } })]
    expect(computeUpgradeSuggestions(records, [{ id: "a/old", total: 50, active: true }])).toEqual([])
  })

  it("qualifies a candidate at exactly total + margin and rejects one below", () => {
    const installed = [{ id: "a/old", total: 50, active: true }]
    const at = [rec("a/old"), rec("a/up", { scores: { ...rec("a/up").scores, total: 55 } })]
    const expected = [{ from: "a/old", to: "a/up", fromTotal: 50, toTotal: 55, clusterId: "c-1" }]
    expect(computeUpgradeSuggestions(at, installed, { margin: 5 })).toEqual(expected)
    expect(computeUpgradeSuggestions(at, installed)).toEqual(expected)

    const below = [rec("a/old"), rec("a/up", { scores: { ...rec("a/up").scores, total: 54 } })]
    expect(computeUpgradeSuggestions(below, installed, { margin: 5 })).toEqual([])
    expect(computeUpgradeSuggestions(below, installed)).toEqual([])
  })
})
