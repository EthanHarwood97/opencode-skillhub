import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { zipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { runAutopilot } from "../src/autopilot.ts"
import { layout, type StoreLayout } from "../src/paths.ts"

const sha = (text: string) => createHash("sha256").update(text).digest("hex")
const bodyFor = (id: string, marker = "v1") => `---\nname: ${id}\ndescription: A fixture. Use when testing.\n---\n\n# ${id}\n\n${marker}\n`

type Rec = Record<string, any>
const makeRecord = (id: string, category: string, total: number, opts: { risk?: string; body?: string } = {}): Rec => {
  const body = opts.body ?? bodyFor(id)
  return {
    id,
    name: id.split("/").at(-1),
    description: "A fixture. Use when testing.",
    category,
    labels: [],
    labelConfidence: 0,
    tags: ["fixture"],
    clusterId: "c-1",
    clusterLabel: "Fixture",
    source: { kind: "marketplace", path: "SKILL.md", url: `https://fixtures.test/${encodeURIComponent(id)}.zip`, licenseFlags: ["unknown-license"] },
    files: [{ path: "SKILL.md", sha256: sha(body), size: Buffer.byteLength(body) }],
    contentHash: sha(body),
    requires: { runtime: [], scripts: [], mcp: [], env: [], services: [] },
    risk: { level: opts.risk ?? "low", findings: [] },
    signals: {},
    scores: { total, quality: total, trust: total, freshness: total, compatibility: total, adoption: total, reasons: [], rubricVersion: "heuristic-v0", evaluatedAt: "2026-10-05T00:00:00.000Z" },
    provenanceTier: "content-hash-pinned",
    status: "candidate",
    relations: { supersedes: [], duplicates: [], alternatives: [] },
  }
}

const lockEntry = (record: Rec, opts: { active?: boolean; contentHash?: string } = {}) => ({
  id: record.id,
  contentHash: opts.contentHash ?? record.contentHash,
  provenanceTier: "content-hash-pinned",
  installedAt: "2026-10-05T00:00:00.000Z",
  files: record.files,
  active: opts.active ?? true,
  riskLevel: record.risk.level,
  total: record.scores.total,
})

const makeStore = (records: Rec[], lock?: Record<string, unknown>): StoreLayout => {
  const root = mkdtempSync(join(tmpdir(), "skillhub-autopilot-"))
  const l = layout(root)
  mkdirSync(l.catalogDir, { recursive: true })
  const byCategory: Record<string, number> = {}
  for (const record of records) byCategory[record.category] = (byCategory[record.category] ?? 0) + 1
  writeFileSync(join(l.catalogDir, "index.json"), JSON.stringify({ version: 1, generatedAt: "", counts: { total: records.length, byStatus: { candidate: records.length }, byCategory }, skills: records }))
  if (lock) writeFileSync(l.lockfilePath, JSON.stringify({ version: 1, skills: lock }))
  return l
}

const fetchImpl = (bodies: Map<string, string>) =>
  (async (input: string | URL) => {
    const body = bodies.get(String(input))
    if (!body) return new Response("missing", { status: 404 })
    return new Response(zipSync({ "SKILL.md": new TextEncoder().encode(body) }), { status: 200 })
  }) as unknown as typeof fetch

const readLock = (l: StoreLayout) => JSON.parse(readFileSync(l.lockfilePath, "utf8")).skills

describe("runAutopilot", () => {
  it("installs and activates one best skill per empty category", async () => {
    const games = makeRecord("a/games", "games", 90)
    const writing = makeRecord("a/writing", "writing", 80)
    const l = makeStore([games, writing])
    const bodies = new Map([[games.source.url, bodyFor(games.id)], [writing.source.url, bodyFor(writing.id)]])

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")), fetchImpl: fetchImpl(bodies) })

    expect(report.actions.map((action) => [action.kind, action.id])).toEqual([["install", "a/games"], ["install", "a/writing"]])
    const lock = readLock(l)
    expect(lock["a/games"].active).toBe(true)
    expect(lock["a/writing"].active).toBe(true)
    expect(existsSync(join(l.managedDir, "a/games", "SKILL.md"))).toBe(true)
    expect(report.active).toBe(2)
  })

  it("keeps the incumbent when the challenger does not beat the margin", async () => {
    const incumbent = makeRecord("a/inc", "games", 90)
    const challenger = makeRecord("a/cha", "games", 91)
    const l = makeStore([incumbent, challenger], { [incumbent.id]: lockEntry(incumbent) })
    const bodies = new Map([[incumbent.source.url, bodyFor(incumbent.id)], [challenger.source.url, bodyFor(challenger.id)]])

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")), fetchImpl: fetchImpl(bodies) })

    expect(report.actions).toEqual([])
    expect(readLock(l)["a/cha"]).toBeUndefined()
  })

  it("swaps the weakest incumbent when a challenger clearly beats it", async () => {
    const incumbent = makeRecord("a/old", "games", 85)
    const challenger = makeRecord("a/new", "games", 92)
    const l = makeStore([incumbent, challenger], { [incumbent.id]: lockEntry(incumbent) })
    mkdirSync(join(l.storeDir, "a/old"), { recursive: true })
    writeFileSync(join(l.storeDir, "a/old", "SKILL.md"), bodyFor("a/old"))
    const bodies = new Map([[incumbent.source.url, bodyFor(incumbent.id)], [challenger.source.url, bodyFor(challenger.id)]])

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")), fetchImpl: fetchImpl(bodies) })

    expect(report.actions.map((action) => action.kind)).toEqual(["swap", "deactivate"])
    expect(report.actions[1]?.reason).toContain("swapped for")
    const lock = readLock(l)
    expect(lock["a/new"].active).toBe(true)
    expect(lock["a/old"].active).toBe(false)
    expect(existsSync(join(l.storeDir, "a/old", "SKILL.md"))).toBe(true)
  })

  it("does not swap for a higher-scoring but riskier challenger", async () => {
    const incumbent = makeRecord("a/safe", "games", 80)
    const challenger = makeRecord("a/risky", "games", 95, { risk: "high" })
    const l = makeStore([incumbent, challenger], { [incumbent.id]: lockEntry(incumbent) })
    const bodies = new Map([[incumbent.source.url, bodyFor(incumbent.id)], [challenger.source.url, bodyFor(challenger.id)]])

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")), fetchImpl: fetchImpl(bodies) })
    expect(report.actions).toEqual([])
  })

  it("updates installed skills in place when upstream content changes", async () => {
    const oldBody = bodyFor("a/upd", "v1")
    const newBody = bodyFor("a/upd", "v2")
    const record = makeRecord("a/upd", "data", 88, { body: newBody })
    const l = makeStore([record], { [record.id]: lockEntry(record, { contentHash: sha(oldBody) }) })
    const bodies = new Map([[record.source.url, newBody]])

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")), fetchImpl: fetchImpl(bodies) })

    expect(report.actions.map((action) => action.kind)).toEqual(["update"])
    expect(readFileSync(join(l.storeDir, "a/upd", "SKILL.md"), "utf8")).toContain("v2")
    expect(readLock(l)["a/upd"].contentHash).toBe(record.contentHash)
    expect(readLock(l)["a/upd"].active).toBe(true)
  })

  it("trims extra active skills beyond the per-category target", async () => {
    const best = makeRecord("a/best", "games", 95)
    const worse = makeRecord("a/worse", "games", 80)
    const l = makeStore([best, worse], { [best.id]: lockEntry(best), [worse.id]: lockEntry(worse) })

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")) })

    expect(report.actions.map((action) => [action.kind, action.id])).toEqual([["deactivate", "a/worse"]])
    const lock = readLock(l)
    expect(lock["a/best"].active).toBe(true)
    expect(lock["a/worse"].active).toBe(false)
  })

  it("trims before swapping so deactivations are never resurrected", async () => {
    const low = makeRecord("a/low", "games", 70)
    const mid = makeRecord("a/mid", "games", 80)
    const high = makeRecord("a/high", "games", 90)
    const best = makeRecord("a/best", "games", 96)
    const l = makeStore([low, mid, high, best], { [low.id]: lockEntry(low), [mid.id]: lockEntry(mid), [high.id]: lockEntry(high) })
    const bodies = new Map([
      [low.source.url, bodyFor(low.id)],
      [mid.source.url, bodyFor(mid.id)],
      [high.source.url, bodyFor(high.id)],
      [best.source.url, bodyFor(best.id)],
    ])

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")), fetchImpl: fetchImpl(bodies) })

    const lock = readLock(l)
    expect(lock["a/best"].active).toBe(true)
    expect(lock["a/low"].active).toBe(false)
    expect(lock["a/mid"].active).toBe(false)
    expect(lock["a/high"].active).toBe(false)
    expect(Object.values(lock).filter((entry: any) => entry.active)).toHaveLength(1)
    expect(existsSync(join(l.managedDir, "a/best"))).toBe(true)
    expect(existsSync(join(l.managedDir, "a/high"))).toBe(false)
    expect(report.active).toBe(1)
  })

  it("activates the kept best skill when it was inactive and trims the active extra", async () => {
    const best = makeRecord("a/best", "games", 95)
    const worse = makeRecord("a/worse", "games", 80)
    const l = makeStore([best, worse], { [best.id]: lockEntry(best, { active: false }), [worse.id]: lockEntry(worse, { active: true }) })
    mkdirSync(join(l.storeDir, "a/best"), { recursive: true })
    writeFileSync(join(l.storeDir, "a/best", "SKILL.md"), bodyFor("a/best"))
    mkdirSync(join(l.storeDir, "a/worse"), { recursive: true })
    writeFileSync(join(l.storeDir, "a/worse", "SKILL.md"), bodyFor("a/worse"))

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")) })

    expect(report.actions.map((action) => action.kind)).toEqual(["deactivate", "activate"])
    const lock = readLock(l)
    expect(lock["a/best"].active).toBe(true)
    expect(lock["a/worse"].active).toBe(false)
    expect(existsSync(join(l.managedDir, "a/best", "SKILL.md"))).toBe(true)
    expect(report.active).toBe(1)
  })

  it("never trims or swaps pinned skills and still manages the unpinned slot", async () => {
    const pinned = makeRecord("a/pinned", "games", 60)
    const low = makeRecord("a/low", "games", 80)
    const high = makeRecord("a/high", "games", 90)
    const better = makeRecord("a/better", "games", 99)
    const l = makeStore([pinned, low, high, better], {
      [pinned.id]: { ...lockEntry(pinned), pinned: true },
      [low.id]: lockEntry(low),
      [high.id]: lockEntry(high),
    })
    const bodies = new Map([[better.source.url, bodyFor(better.id)]])

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")), fetchImpl: fetchImpl(bodies) })

    const lock = readLock(l)
    expect(lock["a/pinned"].active).toBe(true)
    expect(lock["a/better"].active).toBe(true)
    expect(lock["a/low"].active).toBe(false)
    expect(lock["a/high"].active).toBe(false)
    expect(report.active).toBe(2)
    expect(report.actions.some((action) => action.kind === "swap" && action.id === "a/better")).toBe(true)
    expect(report.actions.every((action) => action.id !== "a/pinned" || action.kind === "skip")).toBe(true)
  })

  it("never installs a candidate whose name collides with an installed skill", async () => {
    const old = makeRecord("a/old", "games", 70)
    const sameName = makeRecord("b/old", "games", 99)
    const l = makeStore([old, sameName], { [old.id]: lockEntry(old) })
    const bodies = new Map([[sameName.source.url, bodyFor(sameName.id)]])

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")), fetchImpl: fetchImpl(bodies) })

    expect(readLock(l)["b/old"]).toBeUndefined()
    expect(report.actions.some((action) => action.id === "b/old")).toBe(false)
  })

  it("changes nothing on a dry run", async () => {
    const record = makeRecord("a/games", "games", 90)
    const l = makeStore([record])
    const bodies = new Map([[record.source.url, bodyFor(record.id)]])

    const report = await runAutopilot({ l, index: JSON.parse(readFileSync(join(l.catalogDir, "index.json"), "utf8")), fetchImpl: fetchImpl(bodies), dryRun: true })

    expect(report.dryRun).toBe(true)
    expect(report.actions.map((action) => action.kind)).toEqual(["install"])
    expect(existsSync(l.lockfilePath)).toBe(false)
    expect(existsSync(join(l.storeDir, "a/games"))).toBe(false)
  })
})
