import { describe, expect, it } from "vitest"
import { DEFAULT_RETRIEVAL, formatRetrievalBlock, pickAutoBody, rankCandidates, selectCandidates, type CandidateInput } from "../src/retrieval-core.ts"

const row = (id: string, over: Partial<CandidateInput> = {}): CandidateInput => ({
  id,
  name: id.split("/").at(-1) ?? id,
  description: "does a research thing",
  tags: ["research"],
  risk: "low",
  total: 60,
  ftsRank: 1,
  ...over,
})

describe("rankCandidates", () => {
  it("blends vector cosine and lexical rank, preferring the closer vector", () => {
    const query = Float32Array.from([1, 0, 0])
    const vectors = new Map([
      ["a/near", Float32Array.from([1, 0, 0])],
      ["a/far", Float32Array.from([0, 1, 0])],
    ])
    const ranked = rankCandidates("plan a research report", [row("a/far"), row("a/near")], query, vectors)
    expect(ranked[0]!.id).toBe("a/near")
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score)
  })

  it("falls back to lexical-only when no query vector is available", () => {
    const ranked = rankCandidates("research", [row("a/one", { ftsRank: 5 }), row("a/two", { ftsRank: 1 })], undefined, undefined)
    expect(ranked[0]!.id).toBe("a/one")
    // lexical 1 + tag boost 0.03, clamped to 1
    expect(ranked[0]!.score).toBe(1)
    expect(ranked[1]!.score).toBeCloseTo(0.23, 3)
  })

  it("is deterministic on ties", () => {
    const ranked = rankCandidates("x", [row("a/b", { total: 50 }), row("a/a", { total: 50 }), row("a/c", { total: 50 })], undefined, undefined)
    expect(ranked.map((entry) => entry.id)).toEqual(["a/a", "a/b", "a/c"])
  })
})

describe("selectCandidates", () => {
  it("applies the threshold and the pointer cap", () => {
    const candidates = rankCandidates("x", [row("a/one", { ftsRank: 10 }), row("a/two", { ftsRank: 1 })], undefined, undefined)
    expect(selectCandidates(candidates, { ...DEFAULT_RETRIEVAL, minScore: 0.5 })).toHaveLength(1)
    expect(selectCandidates(candidates, { ...DEFAULT_RETRIEVAL, minScore: 0, maxPointers: 1 })).toHaveLength(1)
  })
})

describe("formatRetrievalBlock", () => {
  it("formats the pinned block and truncates long descriptions", () => {
    const long = "x".repeat(140)
    const candidates = rankCandidates("x", [row("a/one", { description: long })], undefined, undefined)
    const block = formatRetrievalBlock(candidates)!
    expect(block).toContain("<skillhub-retrieval>")
    expect(block).toContain("a/one — one (match")
    expect(block).toContain("…")
    expect(block).toContain("skillhub_load(id)")
    expect(formatRetrievalBlock([])).toBeUndefined()
  })
})

describe("pickAutoBody", () => {
  it("picks only in auto mode and only above autoScore", () => {
    const query = Float32Array.from([1, 0])
    const vectors = new Map([
      ["a/one", Float32Array.from([0.6, 0.8])],
      ["a/two", Float32Array.from([0.8, 0.6])],
    ])
    // equal lexical weight -> one 0.77, two 0.90 (plus the 0.03 tag boost)
    const mixed = rankCandidates("research", [row("a/one", { ftsRank: 10 }), row("a/two", { ftsRank: 10 })], query, vectors)
    expect(mixed[0]!.id).toBe("a/two")
    expect(pickAutoBody(mixed, { ...DEFAULT_RETRIEVAL, mode: "auto", autoScore: 0.55 })?.id).toBe("a/two")
    expect(pickAutoBody(mixed, { ...DEFAULT_RETRIEVAL, mode: "auto", autoScore: 0.95 })).toBeUndefined()
    expect(pickAutoBody(mixed, { ...DEFAULT_RETRIEVAL, mode: "suggest" })).toBeUndefined()
  })
})
