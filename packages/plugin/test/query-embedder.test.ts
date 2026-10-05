import { describe, expect, it } from "vitest"
import { makeQueryEmbedder } from "../src/query-embedder.ts"

describe("makeQueryEmbedder", () => {
  it("returns undefined without a key and on failure", async () => {
    expect(await makeQueryEmbedder({ apiKey: undefined })("x")).toBeUndefined()
    const failing = (async () => {
      throw new Error("down")
    }) as unknown as typeof fetch
    expect(await makeQueryEmbedder({ apiKey: "k", fetchImpl: failing })("x")).toBeUndefined()
  })

  it("embeds, normalizes and caches by text", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response(JSON.stringify({ embeddings: [{ values: [3, 4] }] }), { status: 200 })
    }) as unknown as typeof fetch
    const embed = makeQueryEmbedder({ apiKey: "k", dim: 2, fetchImpl })
    const first = await embed("hello")
    const values = Array.from(first!)
    expect(values[0]!).toBeCloseTo(0.6, 6)
    expect(values[1]!).toBeCloseTo(0.8, 6)
    const second = await embed("hello")
    expect(second).toBe(first)
    expect(calls).toBe(1)
  })

  it("forwards an AbortSignal timeout to the provider fetch", async () => {
    const signals: (AbortSignal | null | undefined)[] = []
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      signals.push(init?.signal)
      return new Response(JSON.stringify({ embeddings: [{ values: [3, 4] }] }), { status: 200 })
    }) as unknown as typeof fetch
    await makeQueryEmbedder({ apiKey: "k", dim: 2, fetchImpl })("hello")
    expect(signals).toHaveLength(1)
    expect(signals[0]).toBeInstanceOf(AbortSignal)
  })
})
