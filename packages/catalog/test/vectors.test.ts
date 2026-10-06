import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { EmbeddingProvider } from "../src/embeddings.ts"
import { readVectors, vectorText, writeVectors } from "../src/vectors.ts"
import { makeRecord } from "./helpers.ts"

const fakeEmbedder = (): EmbeddingProvider & { calls: number } => ({
  name: "fake",
  model: "fake-1",
  dim: 3,
  calls: 0,
  async embed(texts) {
    ;(this as { calls: number }).calls += texts.length
    return texts.map((text) => Float32Array.from([text.length % 7 + 1, 1, 1])).map((v) => {
      let n = 0
      for (const x of v) n += x * x
      n = Math.sqrt(n)
      for (let i = 0; i < v.length; i++) v[i] = v[i]! / n
      return v
    })
  },
})

describe("writeVectors/readVectors", () => {
  const records = [makeRecord({ id: "a/one", contentHash: "h1", name: "One", description: "first", tags: ["x"] }), makeRecord({ id: "a/two", contentHash: "h2", name: "Two", description: "second", tags: ["y"] })]

  const patchMeta = (dir: string, patch: Record<string, unknown>): void => {
    const metaPath = join(dir, "vectors.json")
    writeFileSync(metaPath, JSON.stringify({ ...(JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>), ...patch }))
  }

  it("writes bin+meta and reads vectors back in order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec-"))
    const embedder = fakeEmbedder()
    const result = await writeVectors(records, dir, { embedder, now: new Date("2026-10-05T00:00:00Z") })
    expect(result).toMatchObject({ embedded: 2, reused: 0 })
    expect(result.warnings).toEqual([])
    const loaded = readVectors(dir)!
    expect(loaded.meta).toMatchObject({ version: 1, provider: "fake", model: "fake-1", dim: 3 })
    expect(loaded.meta.ids.map((entry) => entry.id)).toEqual(["a/one", "a/two"])
    expect(loaded.vectors.size).toBe(2)
    expect(loaded.vectors.get("a/one")!.length).toBe(3)
    expect(loaded.vectors.get("a/two")!.length).toBe(3)
  })

  it("reuses unchanged hashes on a second run (delta-only)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec2-"))
    await writeVectors(records, dir, { embedder: fakeEmbedder(), now: new Date("2026-10-05T00:00:00Z") })
    const second = fakeEmbedder()
    const result = await writeVectors(records, dir, { embedder: second, now: new Date("2026-10-06T00:00:00Z") })
    expect(result).toMatchObject({ embedded: 0, reused: 2 })
    expect(second.calls).toBe(0)
  })

  it("re-embeds when contentHash changes or the provider changes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec3-"))
    await writeVectors(records, dir, { embedder: fakeEmbedder(), now: new Date("2026-10-05T00:00:00Z") })
    const changed = [records[0]!, makeRecord({ ...records[1]!, contentHash: "h2b" })]
    const second = fakeEmbedder()
    const result = await writeVectors(changed, dir, { embedder: second, now: new Date("2026-10-06T00:00:00Z") })
    expect(result).toMatchObject({ embedded: 1, reused: 1 })
    expect(second.calls).toBe(1)
    const other = { ...fakeEmbedder(), model: "fake-2" }
    const third = await writeVectors(changed, dir, { embedder: other, now: new Date("2026-10-07T00:00:00Z") })
    expect(third.embedded).toBe(2)
  })

  it("dedupes identical content hashes and builds the text from name/description/tags", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec4-"))
    const dupes = [makeRecord({ id: "a/one", contentHash: "same" }), makeRecord({ id: "a/copy", contentHash: "same" })]
    const embedder = fakeEmbedder()
    const result = await writeVectors(dupes, dir, { embedder, now: new Date("2026-10-05T00:00:00Z") })
    expect(result.embedded).toBe(1)
    expect(embedder.calls).toBe(1)
    expect(vectorText({ name: "One", description: "first", tags: ["x", "y"] })).toContain("One")
  })

  it("returns undefined for a truncated bin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec5-"))
    await writeVectors(records, dir, { embedder: fakeEmbedder(), now: new Date("2026-10-05T00:00:00Z") })
    const binPath = join(dir, "vectors.bin")
    const bin = readFileSync(binPath)
    writeFileSync(binPath, bin.subarray(0, bin.length - 4))
    expect(readVectors(dir)).toBeUndefined()
  })

  it("returns undefined for a corrupt dim", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec6-"))
    await writeVectors(records, dir, { embedder: fakeEmbedder(), now: new Date("2026-10-05T00:00:00Z") })
    patchMeta(dir, { dim: 0 })
    expect(readVectors(dir)).toBeUndefined()
  })

  it("does not reuse artifacts whose version does not match", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec7-"))
    await writeVectors(records, dir, { embedder: fakeEmbedder(), now: new Date("2026-10-05T00:00:00Z") })
    patchMeta(dir, { version: 999 })
    const second = fakeEmbedder()
    const result = await writeVectors(records, dir, { embedder: second, now: new Date("2026-10-06T00:00:00Z") })
    expect(result).toMatchObject({ embedded: records.length, reused: 0 })
    expect(second.calls).toBe(records.length)
  })

  it("keeps reused vectors and warns instead of failing when new embeddings error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec9-"))
    await writeVectors(records, dir, { embedder: fakeEmbedder(), now: new Date("2026-10-05T00:00:00Z") })
    const changed = [records[0]!, makeRecord({ ...records[1]!, contentHash: "h2b" })]
    const failing: EmbeddingProvider = { name: "fake", model: "fake-1", dim: 3, embed: async () => { throw new Error("fetch failed") } }
    const result = await writeVectors(changed, dir, { embedder: failing, now: new Date("2026-10-06T00:00:00Z") })
    expect(result).toMatchObject({ embedded: 0, reused: 2 })
    expect(result.warnings[0]).toContain("fetch failed")
    expect(readVectors(dir)).toBeDefined()
  })

  it("throws when a provider returns vectors of the wrong dimension", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec8-"))
    const bad: EmbeddingProvider = { name: "bad", model: "bad-1", dim: 3, embed: async (texts) => texts.map(() => Float32Array.from([1, 0, 0, 0])) }
    await expect(writeVectors(records, dir, { embedder: bad, now: new Date("2026-10-05T00:00:00Z") })).rejects.toThrow("embedding dimension mismatch")
  })
})
