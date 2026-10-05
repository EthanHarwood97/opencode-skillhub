import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { computeTrending, readSnapshots, selectBaseline, snapshotFromRecords, writeSnapshot, type StarSnapshot } from "../src/trending.ts"
import { makeRecord } from "./helpers.ts"

const now = new Date("2026-10-05T00:00:00Z")
const repoRec = (id: string, repo: string, stars: number, createdAt: string | null = null, total = 50) => {
  const defaults = makeRecord({ id })
  return makeRecord({
    id,
    source: { ...defaults.source, kind: "github", repo, path: "SKILL.md", ref: "abc" },
    signals: { ...defaults.signals, stars, createdAt },
    scores: { ...defaults.scores, total },
  })
}

const snap = (date: string, repos: Record<string, number>): StarSnapshot => ({ version: 1, date, repos })

describe("snapshots", () => {
  it("takes max stars per repo and round-trips to disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-trend-"))
    const snapshot = snapshotFromRecords([repoRec("a/x", "acme/skills", 10), repoRec("a/y", "acme/skills", 30)], now)
    expect(snapshot.repos).toEqual({ "acme/skills": 30 })
    writeSnapshot(dir, snapshot)
    expect(readSnapshots(dir)).toHaveLength(1)
    expect(readSnapshots(join(dir, "nope"))).toEqual([])
  })

  it("selects the newest baseline at least N days old", () => {
    const snapshots = [snap("2026-08-20T00:00:00Z", { a: 5 }), snap("2026-09-28T00:00:00Z", { a: 20 })]
    expect(selectBaseline(snapshots, now, 7)?.date).toBe("2026-09-28T00:00:00Z")
    expect(selectBaseline(snapshots, now, 40)?.date).toBe("2026-08-20T00:00:00Z")
    expect(selectBaseline(snapshots, now, 400)).toBeUndefined()
  })
})

describe("computeTrending", () => {
  it("computes 7d/30d velocity and new-this-month", () => {
    const records = [repoRec("a/x", "acme/skills", 100), repoRec("a/new", "newco/fresh", 5, "2026-09-20T00:00:00Z")]
    const trending = computeTrending(records, {
      snapshots: [snap("2026-09-28T00:00:00Z", { "acme/skills": 80 }), snap("2026-09-01T00:00:00Z", { "acme/skills": 50 })],
      now,
    })
    expect(trending.topVelocity[0]).toMatchObject({ id: "a/x", repo: "acme/skills", delta7d: 20, delta30d: 50 })
    expect(trending.newThisMonth.map((e) => e.id)).toEqual(["a/new"])
  })
})
