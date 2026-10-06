import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildCurationMessages,
  curateRecords,
  curationKey,
  CURATION_VERSION,
  makeCurator,
  parseCurationResponse,
  readCurationCache,
  renderBrief,
  writeCurationCache,
  type CurationEvaluation,
} from "../src/curate.ts"
import type { LlmClient } from "../src/llm.ts"
import { makeRecord } from "./helpers.ts"

const curation = (over: Partial<CurationEvaluation["result"]> = {}, costUsd = 0.001): CurationEvaluation => ({
  result: { category: "engineering", confidence: "high", flags: [], summary: "does a thing", ...over },
  usage: { inputTokens: 100, outputTokens: 10 },
  costUsd,
  model: "test-model",
})

describe("parseCurationResponse", () => {
  it("parses plain and fenced JSON", () => {
    const json = '{"category":" Games ","confidence":"high","flags":["spam","unknown"],"summary":"fine"}'
    expect(parseCurationResponse(json)).toMatchObject({ category: "games", confidence: "high" })
    expect(parseCurationResponse("```json\n" + json + "\n```")).toMatchObject({ category: "games" })
  })

  it("rejects malformed responses", () => {
    expect(() => parseCurationResponse("{}")).toThrow(/invalid curation response/)
    expect(() => parseCurationResponse("not json")).toThrow()
  })
})

describe("makeCurator", () => {
  it("builds the messages with the current category and parses the client reply", async () => {
    const client: LlmClient = {
      complete: async (messages) => {
        expect(messages[0]!.content).toContain("curator")
        expect(messages[1]!.content).toContain("current category: data")
        return { text: '{"category":"ai","confidence":"medium","flags":[],"summary":"ok"}', usage: { inputTokens: 10, outputTokens: 5 }, model: "m" }
      },
    }
    const result = await makeCurator(client)({ id: "a/x", name: "x", description: "d", body: "b", currentCategory: "data" })
    expect(result.result.category).toBe("ai")
    expect(result.costUsd).toBeGreaterThan(0)
    expect(buildCurationMessages({ id: "a/x", name: "x", description: "d", body: "b", currentCategory: "data" })).toHaveLength(2)
  })
})

describe("curateRecords", () => {
  const records = [
    makeRecord({ id: "a/wrong", category: "web3", contentHash: "h1" }),
    makeRecord({ id: "a/right", category: "games", contentHash: "h2" }),
    makeRecord({ id: "a/low", category: "data", contentHash: "h3" }),
  ]
  const bodies = new Map([
    ["a/wrong", "# wrong"],
    ["a/right", "# right"],
    ["a/low", "# low"],
  ])

  it("applies only high-confidence corrections and records flags", async () => {
    const curate = async (input: { id: string }): Promise<CurationEvaluation> => {
      if (input.id === "a/wrong") return curation({ category: "games", flags: ["thin"] })
      if (input.id === "a/low") return curation({ category: "ai", confidence: "low" })
      return curation({ category: "games" })
    }
    const { records: out, report } = await curateRecords(records, { cache: { version: 1, entries: {} }, curate, bodies, now: new Date("2026-10-05T00:00:00Z") })
    expect(out.find((r) => r.id === "a/wrong")!.category).toBe("games")
    expect(out.find((r) => r.id === "a/low")!.category).toBe("data")
    expect(report.totals).toMatchObject({ scanned: 3, curated: 3, corrected: 1, flagged: 1 })
    expect(report.corrections).toEqual([{ id: "a/wrong", name: "wrong", from: "web3", to: "games", reason: "does a thing" }])
    expect(report.highlights).toEqual([{ id: "a/wrong", name: "wrong", category: "games", flags: ["thin"], summary: "does a thing" }])
  })

  it("serves cache hits without calling the model and respects the caps", async () => {
    const cache = {
      version: 1 as const,
      entries: {
        [curationKey("h1", CURATION_VERSION)]: { contentHash: "h1", curationVersion: CURATION_VERSION, category: "web3", confidence: "high" as const, flags: [], summary: "cached", model: "m", costUsd: 0, curatedAt: "t", applied: false },
      },
    }
    const calls: string[] = []
    const curate = async (input: { id: string }): Promise<CurationEvaluation> => {
      calls.push(input.id)
      return curation({ category: "games" }, 0.02)
    }
    const { report } = await curateRecords(records, { cache, curate, bodies, maxUsd: 0.03, costPerItemUsd: 0.02, now: new Date() })
    expect(calls).toEqual(["a/low"])
    expect(report.totals).toMatchObject({ cached: 1, curated: 1, skippedBudget: 1 })
    expect(report.totals.spentUsd).toBeCloseTo(0.02, 6)
  })

  it("re-applies cached corrections on a later run without calling the model", async () => {
    const first = await curateRecords(records, { cache: { version: 1, entries: {} }, curate: async () => curation({ category: "games" }), bodies, now: new Date() })
    const calls: string[] = []
    const second = await curateRecords(records, {
      cache: first.cache,
      curate: async (input) => {
        calls.push(input.id)
        return curation({ category: "games" })
      },
      bodies,
      now: new Date(),
    })
    expect(calls).toEqual([])
    expect(second.records.find((r) => r.id === "a/wrong")!.category).toBe("games")
    expect(second.report.totals.cached).toBe(3)
    expect(second.report.corrections).toEqual([])
  })

  it("restricts curation to selected ids while still re-applying cached corrections", async () => {
    const cache = {
      version: 1 as const,
      entries: {
        [curationKey("h1", CURATION_VERSION)]: { contentHash: "h1", curationVersion: CURATION_VERSION, category: "games", confidence: "high" as const, flags: [], summary: "cached fix", model: "m", costUsd: 0, curatedAt: "t", applied: true },
      },
    }
    const calls: string[] = []
    const { records: out, report } = await curateRecords(records, {
      cache,
      curate: async (input) => {
        calls.push(input.id)
        return curation({ category: "games" })
      },
      bodies,
      ids: new Set(["a/right"]),
      now: new Date(),
    })
    expect(calls).toEqual(["a/right"])
    expect(out.find((record) => record.id === "a/wrong")!.category).toBe("games")
    expect(report.totals.cached).toBe(1)
    expect(report.totals.curated).toBe(1)
  })

  it("isolates failures and skips records without bodies", async () => {
    const curate = async (input: { id: string }): Promise<CurationEvaluation> => {
      if (input.id === "a/wrong") throw new Error("429 rate limited")
      return curation()
    }
    const { report } = await curateRecords(records, { cache: { version: 1, entries: {} }, curate, bodies: new Map([["a/wrong", "#"], ["a/right", "#"]]), now: new Date() })
    expect(report.totals).toMatchObject({ failed: 1, skippedNoBody: 1, curated: 1 })
  })
})

describe("curation cache + brief", () => {
  it("round-trips the cache", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-curate-"))
    const file = join(dir, "state", "curation-cache.json")
    expect(readCurationCache(file)).toEqual({ version: 1, entries: {} })
    writeCurationCache(file, {
      version: 1,
      entries: {
        [curationKey("h", "v")]: { contentHash: "h", curationVersion: "v", category: "games", confidence: "high", flags: [], summary: "s", model: "m", costUsd: 0, curatedAt: "t", applied: true },
      },
    })
    expect(readCurationCache(file).entries[curationKey("h", "v")]?.category).toBe("games")
  })

  it("renders corrections and flags into markdown", () => {
    const markdown = renderBrief({
      version: 1,
      generatedAt: "2026-10-06T00:00:00.000Z",
      totals: { scanned: 3, curated: 3, cached: 0, skippedBudget: 0, skippedNoBody: 0, failed: 0, corrected: 1, flagged: 1, spentUsd: 0.01 },
      corrections: [{ id: "a/x", name: "x", from: "web3", to: "games", reason: "game stuff" }],
      highlights: [{ id: "a/y", name: "y", category: "games", flags: ["thin"], summary: "vague" }],
      summary: "Curated 3 skills.",
    })
    expect(markdown).toContain("Category corrections")
    expect(markdown).toContain("web3 → games")
    expect(markdown).toContain("Flagged skills")
  })
})
