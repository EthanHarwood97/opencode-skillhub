import { describe, expect, it } from "vitest"
import { reconcile } from "../src/reconcile.ts"
import { makeRecord } from "./helpers.ts"

const now = new Date("2026-10-05T00:00:00Z")
const rec = (id: string, hash: string, total = 70) => makeRecord({ id, contentHash: hash, scores: { ...makeRecord({ id }).scores, total } })

describe("reconcile", () => {
  it("diffs ids and hashes, builds a review queue, and sorts sources", () => {
    const file = reconcile({
      previous: { skills: [rec("a/same", "h1"), rec("a/changed", "h2"), rec("a/removed", "h3")] },
      current: [rec("a/same", "h1"), rec("a/changed", "h9"), rec("a/added", "h4", 80), rec("a/low", "h5", 40)],
      sourceStats: [
        { source: "github:agent-skills", candidates: 3, fetchedAt: now.toISOString() },
        { source: "agentskills", candidates: 0, fetchedAt: now.toISOString(), error: "rate limited" },
      ],
      now,
    })
    expect(file.totals).toMatchObject({ previous: 3, current: 4, added: ["a/added", "a/low"], removed: ["a/removed"], changed: ["a/changed"] })
    expect(file.reviewQueue).toEqual(["a/added"])
    expect(file.gaps).toEqual(["source agentskills: rate limited"])
    expect(file.sources.map((s) => s.source)).toEqual(["agentskills", "github:agent-skills"])
  })

  it("flags a catalog that emptied", () => {
    const file = reconcile({ previous: { skills: [rec("a/x", "h")] }, current: [], sourceStats: [], now })
    expect(file.gaps).toContain("catalog emptied since the previous run")
  })

  it("surfaces per-source warnings as gaps", () => {
    const file = reconcile({
      current: [rec("a/x", "h")],
      sourceStats: [{ source: "fixtures", candidates: 1, fetchedAt: now.toISOString(), warnings: ["repo x/y: boom"] }],
      now,
    })
    expect(file.gaps).toEqual(["source fixtures: repo x/y: boom"])
  })
})
