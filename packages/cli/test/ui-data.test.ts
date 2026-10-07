import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { makeRecord } from "../../catalog/test/helpers.ts"
import type { Lockfile } from "../src/lockfile.ts"
import { layout } from "../src/paths.ts"
import { buildBrief, buildClusters, buildDetail, buildReview, buildSkills, buildStatus, buildTrending, loadSnapshot, toCard, type UiSnapshot } from "../src/ui/data.ts"

const scores = (total: number) => ({ total, quality: total, trust: total, freshness: total, compatibility: total, adoption: total, reasons: [], rubricVersion: "heuristic-v0", evaluatedAt: "2026-10-05T00:00:00.000Z" })

const github = { kind: "github" as const, repo: "acme/skills", path: "SKILL.md", ref: "abc123", license: "MIT", licenseFlags: [] }

const snapshot = (): UiSnapshot => ({
  index: {
    version: 1,
    generatedAt: "2026-10-05T00:00:00.000Z",
    counts: { total: 3, byStatus: { candidate: 2, quarantined: 1 }, byCategory: { writing: 1 } },
    skills: [
      makeRecord({ id: "a/one", source: github, category: "writing", tags: ["pdf"], scores: scores(90) }),
      makeRecord({ id: "a/two", status: "quarantined", scores: scores(70) }),
      makeRecord({ id: "a/three", scores: scores(60) }),
    ],
  },
  lock: {
    version: 1,
    skills: {
      "a/one": { id: "a/one", contentHash: "old", provenanceTier: "sha-pinned", installedAt: "", files: [], active: true, riskLevel: "low", total: 80 },
    },
  } satisfies Lockfile,
  reconciliation: {
    version: 1,
    generatedAt: "2026-10-05T00:00:00.000Z",
    totals: { previous: 0, current: 3, added: ["a/three"], removed: [], changed: [] },
    sources: [{ source: "github:x", candidates: 3, fetchedAt: "2026-10-05T00:00:00.000Z" }],
    gaps: ["source y: boom"],
    reviewQueue: ["a/three"],
  },
  warnings: [],
})

describe("toCard", () => {
  it("joins record state with the lockfile", () => {
    const snap = snapshot()
    const card = toCard(snap.index.skills[0]!, snap.lock)
    expect(card).toMatchObject({ id: "a/one", total: 90, installed: true, active: true, updateAvailable: true })
    expect(toCard(snap.index.skills[1]!, snap.lock)).toMatchObject({ installed: false, updateAvailable: false })
  })
})

describe("builders", () => {
  it("builds the status summary", () => {
    const status = buildStatus(snapshot())
    expect(status).toMatchObject({ installed: 1, active: 1, updates: 1, reviewQueue: 1 })
    expect(status.gaps).toEqual(["source y: boom"])
  })

  it("includes per-profile coverage in the status summary", () => {
    const status = buildStatus(snapshot())
    expect(status.coverage.map((profile) => profile.profile)).toEqual(["coding", "content", "research", "business-ops", "design-creative", "ai-builder", "game-dev"])
    const coding = status.coverage.find((profile) => profile.profile === "coding")!
    expect(coding.coverage).toBe(9)
    const engineering = coding.gaps.find((gap) => gap.category === "engineering")!
    expect(engineering).toMatchObject({ supply: 1, min: 3 })
    expect(engineering.top).toEqual([{ id: "a/three", name: "three", total: 60 }])
    const testing = coding.gaps.find((gap) => gap.category === "testing")!
    expect(testing).toMatchObject({ supply: 0, min: 3, top: [] })
  })

  it("drops installed skills from gap tops", () => {
    const snap = snapshot()
    snap.index.skills.push(makeRecord({ id: "a/four", category: "writing", tags: ["pdf"], scores: scores(70) }))
    const content = buildStatus(snap).coverage.find((profile) => profile.profile === "content")!
    const writing = content.gaps.find((gap) => gap.category === "writing")!
    expect(writing.top).toEqual([{ id: "a/four", name: "four", total: 70 }])
  })

  it("reports zero coverage for every profile when the index is empty", () => {
    const empty: UiSnapshot = {
      index: { version: 1, generatedAt: "", counts: { total: 0, byStatus: {}, byCategory: {} }, skills: [] },
      lock: { version: 1, skills: {} },
      warnings: [],
    }
    const status = buildStatus(empty)
    expect(status.coverage).toHaveLength(7)
    expect(status.coverage.every((profile) => profile.coverage === 0)).toBe(true)
  })

  it("maps the nightly curation report into a brief", () => {
    const snap = snapshot()
    snap.curation = {
      version: 1,
      generatedAt: "2026-10-06T00:00:00.000Z",
      totals: { scanned: 10, curated: 5, cached: 5, skippedBudget: 0, skippedNoBody: 0, failed: 0, corrected: 1, flagged: 1, spentUsd: 0.01 },
      corrections: [{ id: "a/three", name: "three", from: "web3", to: "games", reason: "game stuff" }],
      highlights: [{ id: "a/three", name: "three", category: "games", flags: ["thin"], summary: "vague" }],
      summary: "Curated 5 new skills.",
    }
    expect(buildBrief(snap)).toMatchObject({ generatedAt: "2026-10-06T00:00:00.000Z", curated: 5, cached: 5, corrected: 1, flagged: 1 })
    expect(buildBrief({ ...snap, curation: undefined })).toBeUndefined()
  })

  it("filters and paginates cards", () => {
    const page = buildSkills(snapshot(), { q: "pdf" })
    expect(page.items.map((c) => c.id)).toEqual(["a/one"])
  })

  it("finds details and returns undefined for unknown ids", () => {
    expect(buildDetail(snapshot(), "a/three")?.scores.total).toBe(60)
    expect(buildDetail(snapshot(), "a/nope")).toBeUndefined()
  })

  it("assembles the review queue", () => {
    const review = buildReview(snapshot())
    expect(review.newCandidates.map((c) => c.id)).toEqual(["a/three"])
    expect(review.updates).toEqual([{ id: "a/one", from: 80, to: 90, riskFrom: "low", riskTo: "low" }])
    expect(review.quarantined.map((c) => c.id)).toEqual(["a/two"])
    expect(review.upgrades).toEqual([])
  })

  it("suggests a better-ranked same-cluster alternative for an active skill", () => {
    const snap = snapshot()
    snap.index.skills.push(makeRecord({ id: "a/better", source: github, category: "writing", tags: ["pdf"], scores: scores(90) }))
    expect(buildReview(snap).upgrades).toEqual([{ from: "a/one", to: "a/better", fromTotal: 80, toTotal: 90 }])
    expect(buildReview(snapshot()).upgrades).toEqual([])
  })

  it("never offers updates or upgrades for manager-owned local records", () => {
    const snap = snapshot()
    snap.index.skills.push(makeRecord({ id: "local/mine", category: "writing", tags: ["pdf"], scores: scores(30) }))
    snap.lock.skills["local/mine"] = {
      id: "local/mine",
      contentHash: "old",
      provenanceTier: "local",
      installedAt: "",
      files: [],
      active: true,
      pinned: true,
      riskLevel: "low",
      total: 0,
    }
    const review = buildReview(snap)
    expect(review.updates.some((update) => update.id === "local/mine")).toBe(false)
    expect(review.upgrades.some((upgrade) => upgrade.from === "local/mine" || upgrade.to === "local/mine")).toBe(false)

    const card = toCard(snap.index.skills.find((skill) => skill.id === "local/mine")!, snap.lock)
    expect(card).toMatchObject({ installed: true, active: true, updateAvailable: false })
  })

  it("degrades gracefully when optional artifacts are missing", () => {
    const snap = { ...snapshot(), clusters: undefined, trending: undefined, reconciliation: undefined }
    expect(buildClusters(snap).clusters).toEqual([])
    expect(buildTrending(snap).topVelocity).toEqual([])
    expect(buildReview(snap).newCandidates).toEqual([])
  })
})

describe("loadSnapshot", () => {
  it("explains a missing catalog and warns on unreadable optionals", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-ui-data-"))
    const l = layout(root)
    mkdirSync(l.catalogDir, { recursive: true })
    expect(loadSnapshot(l)).toMatchObject({ error: expect.stringContaining("no catalog") })

    writeFileSync(join(l.catalogDir, "index.json"), JSON.stringify({ version: 1, generatedAt: "", counts: { total: 0, byStatus: {}, byCategory: {} }, skills: [] }))
    writeFileSync(join(l.catalogDir, "clusters.json"), "{not json")
    const snap = loadSnapshot(l)
    expect("index" in snap && snap.warnings).toHaveLength(1)
  })

  it("degrades to an empty lock with a warning when the lockfile is corrupt", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-ui-data-lock-"))
    const l = layout(root)
    mkdirSync(l.catalogDir, { recursive: true })
    writeFileSync(join(l.catalogDir, "index.json"), JSON.stringify({ version: 1, generatedAt: "", counts: { total: 0, byStatus: {}, byCategory: {} }, skills: [] }))
    writeFileSync(l.lockfilePath, "{not json")
    const snap = loadSnapshot(l)
    expect("index" in snap && snap.lock).toEqual({ version: 1, skills: {} })
    expect("index" in snap && snap.warnings).toHaveLength(1)
    expect("index" in snap && snap.warnings[0]).toContain(l.lockfilePath)
  })
})
