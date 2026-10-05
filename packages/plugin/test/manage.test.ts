import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { enforceBudget, estimateAdvertisedTokens, promotionCandidates, readUsage, recordLoad, recordSearch, recordSuggestion, usageFileFor } from "../src/manage-core.ts"

const advert = (id: string, description = "d".repeat(100)) => ({ id, name: id.split("/").at(-1)!, description })

describe("usage", () => {
  it("writes per-project usage with counts", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-usage-"))
    const file = usageFileFor(root, "C:/projects/alpha")
    expect(file.startsWith(root)).toBe(true)
    recordSearch(file, new Date("2026-10-05T00:00:00Z"))
    const u1 = recordLoad(file, "a/one", new Date("2026-10-05T00:00:01Z"))
    expect(u1.searches).toBe(1)
    const u2 = readUsage(file)
    expect(u2.loads["a/one"]?.count).toBe(1)
  })

  it("recovers from corrupt usage files and writes atomically", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-usage-"))
    const file = usageFileFor(root, "C:/projects/beta")
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, "{not json")
    expect(readUsage(file)).toEqual({ version: 1, loads: {}, searches: 0, suggestions: 0, lastSuggestedIds: [] })
    const u = recordSearch(file, new Date("2026-10-05T00:00:00Z"))
    expect(u.searches).toBe(1)
    expect(readUsage(file).searches).toBe(1)
    expect(readdirSync(dirname(file))).toEqual(["usage.json"])
  })

  it("records suggestions with the last suggested ids", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-usage-"))
    const file = usageFileFor(root, "C:/projects/gamma")
    const first = recordSuggestion(file, ["a/one", "a/two"], new Date("2026-10-05T00:00:02Z"))
    expect(first.suggestions).toBe(1)
    expect(first.lastSuggestedIds).toEqual(["a/one", "a/two"])
    const second = recordSuggestion(file, ["a/three"], new Date("2026-10-05T00:00:03Z"))
    expect(second.suggestions).toBe(2)
    expect(second.lastSuggestedIds).toEqual(["a/three"])
    expect(readUsage(file)).toEqual({ version: 1, loads: {}, searches: 0, suggestions: 2, lastSuggestedIds: ["a/three"] })
  })

  it("normalizes old usage files that predate suggestion telemetry", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-usage-"))
    const file = usageFileFor(root, "C:/projects/legacy")
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ version: 1, loads: { "a/one": { count: 2, lastAt: "2026-10-01T00:00:00Z" } }, searches: 7 }))
    expect(readUsage(file)).toEqual({
      version: 1,
      loads: { "a/one": { count: 2, lastAt: "2026-10-01T00:00:00Z" } },
      searches: 7,
      suggestions: 0,
      lastSuggestedIds: [],
    })
    const after = recordSuggestion(file, [], new Date("2026-10-05T00:00:04Z"))
    expect(after.suggestions).toBe(1)
    expect(after.searches).toBe(7)
  })
})

describe("budget", () => {
  it("estimates tokens from names + descriptions + the verbose-format overhead", () => {
    expect(estimateAdvertisedTokens([advert("a/one")])).toBe(61)
  })
  it("demotes least-used skills beyond the cap, keeping highest-use first", () => {
    const adverts = [advert("a/hot"), advert("a/cold"), advert("a/mid")]
    const r = enforceBudget({ adverts, uses: { "a/hot": 9, "a/mid": 3, "a/cold": 0 }, cap: estimateAdvertisedTokens([adverts[0]!, adverts[2]!]) })
    expect(r.keep).toEqual(["a/hot", "a/mid"])
    expect(r.demote).toEqual(["a/cold"])
  })
})

describe("promotionCandidates", () => {
  it("lists installed-inactive skills used at or above threshold", () => {
    const lock = { version: 1 as const, skills: { "a/one": { active: false }, "a/two": { active: true }, "a/three": { active: false } } as any }
    const usage = { version: 1 as const, searches: 0, loads: { "a/one": { count: 3, lastAt: "" }, "a/three": { count: 1, lastAt: "" } } }
    expect(promotionCandidates({ lock, usage }).map((c) => c.id)).toEqual(["a/one"])
  })
})
