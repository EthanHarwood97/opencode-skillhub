import { describe, expect, it } from "vitest"
import { EmbeddingError, makeGeminiEmbedder } from "../src/embeddings.ts"

const reply = (count: number, dim = 4) =>
  new Response(JSON.stringify({ embeddings: Array.from({ length: count }, (_, i) => ({ values: Array.from({ length: dim }, (_, d) => i + d + 1) })) }), { status: 200 })

describe("makeGeminiEmbedder", () => {
  it("posts batched requests and returns normalized vectors", async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string | URL) => {
      calls.push(String(url))
      return reply(2)
    }) as unknown as typeof fetch
    const embedder = makeGeminiEmbedder({ apiKey: "k", dim: 4, fetchImpl })
    const vectors = await embedder.embed(["one", "two"])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain(":batchEmbedContents")
    expect(calls[0]).toContain("key=k")
    expect(vectors).toHaveLength(2)
    expect(vectors[0]!.length).toBe(4)
    let norm = 0
    for (const v of vectors[0]!) norm += v * v
    expect(Math.sqrt(norm)).toBeCloseTo(1, 6)
  })

  it("chunks above batchSize, echoing exactly the requested count", async () => {
    let calls = 0
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      calls++
      const body = JSON.parse(String(init?.body)) as { requests: unknown[] }
      return reply(body.requests.length)
    }) as unknown as typeof fetch
    const embedder = makeGeminiEmbedder({ apiKey: "k", dim: 4, fetchImpl, batchSize: 2 })
    const vectors = await embedder.embed(["a", "b", "c", "d", "e"])
    expect(calls).toBe(3)
    expect(vectors).toHaveLength(5)
  })

  it("retries once on 500 then succeeds; throws EmbeddingError on 400", async () => {
    let calls = 0
    const flaky = (async () => {
      calls++
      return calls === 1 ? new Response("boom", { status: 500 }) : reply(1)
    }) as unknown as typeof fetch
    await expect(makeGeminiEmbedder({ apiKey: "k", dim: 4, fetchImpl: flaky }).embed(["x"])).resolves.toHaveLength(1)
    expect(calls).toBe(2)

    const bad = (async () => new Response("nope", { status: 400 })) as unknown as typeof fetch
    await expect(makeGeminiEmbedder({ apiKey: "k", dim: 4, fetchImpl: bad }).embed(["x"])).rejects.toBeInstanceOf(EmbeddingError)
  })
})
