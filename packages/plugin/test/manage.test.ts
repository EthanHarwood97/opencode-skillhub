import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { enforceBudget, estimateAdvertisedTokens, promotionCandidates, readUsage, recordLoad, recordSearch, usageFileFor } from "../src/manage-core.ts"

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
