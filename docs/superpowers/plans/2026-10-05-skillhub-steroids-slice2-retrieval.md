# SkillHub Steroids v1 — Slice 2: Automatic Retrieval (the steroid)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every prompt is matched against the catalog automatically: the plugin embeds the prompt (Gemini, key already present), ranks library skills (vector cosine + FTS BM25 + name/tag boosts), and injects a small evidence-backed block into the agent's context — `suggest` by default, `auto` (one body) opt-in, fail-open to lexical, never blocking a turn.

**Architecture:** Two ends of one seam.
- **Sync end (catalog):** a Gemini embeddings client (`gemini-embedding-001`, 768 dims, batch endpoint, normalized vectors) plus a vector writer that is delta-only by `contentHash` — it reuses the previous `vectors.bin` metadata so unchanged skills are never re-embedded. Artifacts: `catalog/vectors.bin` + `catalog/vectors.json`.
- **Runtime end (plugin):** pure ranking/formatting core + a query embedder with an in-memory cache + a settings reader (`<home>/settings.json`) + a hook factory that turns the latest user message into a `<skillhub-retrieval>` block appended to the system prompt. All deps injected for tests.

**Design decisions (locked, verified live 2026-10-05):**
- Provider: Google `gemini-embedding-001` at `outputDimensionality: 768` via `GOOGLE_API_KEY`/`GEMINI_API_KEY` (already set in the environment). Single and `batchEmbedContents` endpoints verified working; vectors normalized client-side.
- Cost: $0.15/1M input tokens (verified). Catalog of 10k ≈ $0.15 one-time (delta re-syncs ≈ fractions of a cent); runtime ≈ $0.09/month at 100 prompts/day.
- Privacy (documented): when retrieval is on, prompt text is sent to Google's embeddings endpoint. Opt-out: `settings.json → retrieval.embed: "off"` (lexical-only) or `mode: "off"`.
- Modes: `off | suggest | auto` (default `suggest`); `auto` additionally inlines ONE body above `autoScore` and records it as a load.
- Fail-open: any embedding/vector failure degrades to lexical-only; any retrieval failure produces no block.
- Taxonomy/coverage (Slice 0 design, recorded here): keep the 12 coarse categories; add **goal profiles** (`coding`, `content`, `research`, `business-ops`, `design-creative`) mapping to weighted categories with quality bars; the Slice 4 build adds the coverage map + gap report + bulk install by profile. Clusters stay the fine-grained emergent layer. Naming: "Opencode on Steroids" tagline, package `opencode-skillhub`, trademark glance before public launch.

**Tech Stack:** existing catalog/plugin code + built-in `fetch`; zero new dependencies.

**Read before starting:** `packages/catalog/src/embeddings.ts` conventions in `cluster-refine.ts`/`evaluate.ts`; `packages/plugin/src/plugin.ts`, `load-core.ts`, `manage-core.ts`, `search-runtime.ts`, `config-hook.ts`; `packages/cli/src/catalog-cache.ts`.

## Global Constraints

- Node strip-only for cli/catalog/plugin `.ts` (no enums, no parameter properties); relative imports end `.ts`.
- Zero new dependencies. All network access goes through injected `fetchImpl` in tests; no test hits the network.
- Retrieval never delays or fails a turn: every runtime path is wrapped fail-open.
- `suggest` is the default; `auto` must be opt-in via settings.
- Conventional commits; work stays in the `steroids-slice2` worktree.
- Tests: `npx vitest run <file>`; full gate `npm test` + `npm run typecheck`.

---

### Task 1: Gemini embedder + delta-only vector writer (catalog side)

**Files:**
- Create: `packages/catalog/src/embeddings.ts`
- Create: `packages/catalog/src/vectors.ts`
- Test: `packages/catalog/test/embeddings.test.ts`, `packages/catalog/test/vectors.test.ts`

**Interfaces:**
- `type EmbeddingProvider = { name: string; model: string; dim: number; embed: (texts: string[]) => Promise<Float32Array[]> }`
- `class EmbeddingError extends Error { status?: number }` (explicit fields, strip-only safe)
- `makeGeminiEmbedder({ apiKey; model?; dim?; fetchImpl?; batchSize? }): EmbeddingProvider` — batches ≤50 per request, retries once on 429/5xx, normalizes each vector to unit length.
- `VECTORS_VERSION = 1`; `type VectorsMeta`; `readVectors(outDir): { meta; vectors: Map<string, Float32Array> } | undefined`; `vectorText(record)`; `writeVectors(records, outDir, { embedder; now }): Promise<{ embedded; reused }>` — reuses previous vectors by contentHash when provider/model/dim match; dedupes identical contentHashes within a run; writes `vectors.bin` (contiguous Float32, record order) + `vectors.json`.

- [ ] **Step 1: Write the failing embedder tests**

`packages/catalog/test/embeddings.test.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing vector-writer tests**

`packages/catalog/test/vectors.test.ts`:

```ts
import { mkdtempSync } from "node:fs"
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

  it("writes bin+meta and reads vectors back in order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec-"))
    const embedder = fakeEmbedder()
    const result = await writeVectors(records, dir, { embedder, now: new Date("2026-10-05T00:00:00Z") })
    expect(result).toEqual({ embedded: 2, reused: 0 })
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
    expect(result).toEqual({ embedded: 0, reused: 2 })
    expect(second.calls).toBe(0)
  })

  it("re-embeds when contentHash changes or the provider changes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-vec3-"))
    await writeVectors(records, dir, { embedder: fakeEmbedder(), now: new Date("2026-10-05T00:00:00Z") })
    const changed = [records[0]!, makeRecord({ ...records[1]!, contentHash: "h2b" })]
    const second = fakeEmbedder()
    const result = await writeVectors(changed, dir, { embedder: second, now: new Date("2026-10-06T00:00:00Z") })
    expect(result).toEqual({ embedded: 1, reused: 1 })
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
})
```

- [ ] **Step 3: Implement embeddings.ts and vectors.ts**

`packages/catalog/src/embeddings.ts`:

```ts
export type EmbeddingProvider = {
  name: string
  model: string
  dim: number
  embed: (texts: string[]) => Promise<Float32Array[]>
}

export class EmbeddingError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

const retryable = (status: number) => status === 429 || status >= 500

const normalize = (vector: Float32Array): Float32Array => {
  let norm = 0
  for (let i = 0; i < vector.length; i++) norm += vector[i]! * vector[i]!
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < vector.length; i++) vector[i] = vector[i]! / norm
  return vector
}

export function makeGeminiEmbedder(opts: {
  apiKey: string
  model?: string
  dim?: number
  fetchImpl?: typeof fetch
  batchSize?: number
}): EmbeddingProvider {
  const model = opts.model ?? "gemini-embedding-001"
  const dim = opts.dim ?? 768
  const fetchImpl = opts.fetchImpl ?? fetch
  const batchSize = Math.min(opts.batchSize ?? 50, 50)
  const base = "https://generativelanguage.googleapis.com/v1beta"

  const embedBatch = async (texts: string[]): Promise<Float32Array[]> => {
    const body = JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        outputDimensionality: dim,
      })),
    })
    let lastStatus: number | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetchImpl(`${base}/models/${model}:batchEmbedContents?key=${encodeURIComponent(opts.apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
      if (res.ok) {
        const json = (await res.json()) as { embeddings?: { values?: number[] }[] }
        const rows = json.embeddings ?? []
        if (rows.length !== texts.length) throw new EmbeddingError(`expected ${texts.length} embeddings, got ${rows.length}`)
        return rows.map((row) => normalize(Float32Array.from(row.values ?? [])))
      }
      lastStatus = res.status
      if (!retryable(res.status)) break
    }
    throw new EmbeddingError(`embedding request failed (status ${lastStatus})`, lastStatus)
  }

  return {
    name: "gemini",
    model,
    dim,
    embed: async (texts) => {
      const out: Float32Array[] = []
      for (let i = 0; i < texts.length; i += batchSize) out.push(...(await embedBatch(texts.slice(i, i + batchSize))))
      return out
    },
  }
}
```

`packages/catalog/src/vectors.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { EmbeddingProvider } from "./embeddings.ts"
import type { SkillRecord } from "./types.ts"

export const VECTORS_VERSION = 1

export type VectorsMeta = {
  version: 1
  provider: string
  model: string
  dim: number
  generatedAt: string
  ids: { id: string; contentHash: string }[]
}

export type VectorsFile = { meta: VectorsMeta; vectors: Map<string, Float32Array> }

export const vectorText = (record: Pick<SkillRecord, "name" | "description" | "tags">): string =>
  `${record.name} · ${record.description} · ${record.tags.join(" ")}`.slice(0, 600)

export function readVectors(outDir: string): VectorsFile | undefined {
  const metaPath = join(outDir, "vectors.json")
  const binPath = join(outDir, "vectors.bin")
  if (!existsSync(metaPath) || !existsSync(binPath)) return undefined
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as VectorsMeta
    const buf = readFileSync(binPath)
    const stride = meta.dim * 4
    const vectors = new Map<string, Float32Array>()
    meta.ids.forEach((entry, index) => {
      const slice = buf.subarray(index * stride, (index + 1) * stride)
      vectors.set(entry.id, new Float32Array(Uint8Array.from(slice).buffer))
    })
    return { meta, vectors }
  } catch {
    return undefined
  }
}

export async function writeVectors(
  records: SkillRecord[],
  outDir: string,
  opts: { embedder: EmbeddingProvider; now: Date },
): Promise<{ embedded: number; reused: number }> {
  const previous = readVectors(outDir)
  const reusable =
    previous && previous.meta.provider === opts.embedder.name && previous.meta.model === opts.embedder.model && previous.meta.dim === opts.embedder.dim
      ? previous
      : undefined
  const byHash = new Map<string, Float32Array>()
  if (reusable) for (const entry of reusable.meta.ids) {
    const vector = reusable.vectors.get(entry.id)
    if (vector) byHash.set(entry.contentHash, vector)
  }

  const missing: { hash: string; text: string }[] = []
  const seen = new Set<string>()
  for (const record of records) {
    if (byHash.has(record.contentHash) || seen.has(record.contentHash)) continue
    seen.add(record.contentHash)
    missing.push({ hash: record.contentHash, text: vectorText(record) })
  }

  if (missing.length > 0) {
    const fresh = await opts.embedder.embed(missing.map((entry) => entry.text))
    fresh.forEach((vector, index) => byHash.set(missing[index]!.hash, vector))
  }

  mkdirSync(outDir, { recursive: true })
  const dim = opts.embedder.dim
  const bin = Buffer.alloc(records.length * dim * 4)
  records.forEach((record, index) => {
    const vector = byHash.get(record.contentHash)
    if (vector) Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).copy(bin, index * dim * 4)
  })
  writeFileSync(join(outDir, "vectors.bin"), bin)
  const meta: VectorsMeta = {
    version: 1,
    provider: opts.embedder.name,
    model: opts.embedder.model,
    dim,
    generatedAt: opts.now.toISOString(),
    ids: records.map((record) => ({ id: record.id, contentHash: record.contentHash })),
  }
  writeFileSync(join(outDir, "vectors.json"), JSON.stringify(meta, null, 2) + "\n")
  return { embedded: missing.length, reused: records.length - missing.length }
}
```

- [ ] **Step 4: Run tests, typecheck, commit**

Run: `npx vitest run packages/catalog/test/embeddings.test.ts packages/catalog/test/vectors.test.ts && npm run typecheck`
Commit: `feat(catalog): Gemini embeddings client and delta-only vector artifacts`

---

### Task 2: Sync + import wiring for vectors

**Files:**
- Modify: `packages/catalog/src/sync.ts` (optional `vectors` option; write after publish; warnings never fail the sync)
- Modify: `packages/catalog/src/sync-bin.ts` (`--no-vectors`; key detection; print stats)
- Modify: `packages/cli/src/catalog-cache.ts` (copy `vectors.json`/`vectors.bin` when present — read the file first and extend its existing copied-file list)
- Test: `packages/catalog/test/sync.test.ts` (add a vectors case), `packages/cli/test/*` import test (extend the existing catalog-cache/import test with the vectors-present and vectors-absent cases)

**Interfaces:**
- `syncCatalog` options gain `vectors?: { embedder: EmbeddingProvider }`; result gains `vectors?: { embedded: number; reused: number; warnings: string[] }` — warnings collected (never thrown): embedding failure leaves the catalog published without vectors.
- `sync-bin` flags: `--no-vectors`; when `GOOGLE_API_KEY`/`GEMINI_API_KEY` is present and vectors are enabled, construct the Gemini embedder and print `vectors: gemini-embedding-001 @ 768 dims`; otherwise print a skip line including the reason.
- `importCatalog` copies the two vector files when both exist in the source.

- [ ] **Step 1: Extend the sync test (failing first)**

Add to `packages/catalog/test/sync.test.ts`:

```ts
  it("writes vector artifacts when an embedder is provided and warns (without failing) when it errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-sync-vec-"))
    const embedder = { name: "fake", model: "fake-1", dim: 3, embed: async (texts: string[]) => texts.map(() => Float32Array.from([1, 0, 0])) }
    const ok = await syncCatalog({
      sources: [{ name: "s", load: async () => [skill("pdf-tool", "acme/skills")] }],
      outDir: join(root, "catalog"),
      stateDir: join(root, "state"),
      now,
      vectors: { embedder },
    })
    expect(ok.vectors).toEqual({ embedded: 1, reused: 0, warnings: [] })
    expect(existsSync(join(root, "catalog", "vectors.json"))).toBe(true)
    expect(existsSync(join(root, "catalog", "vectors.bin"))).toBe(true)

    const failing = { ...embedder, embed: async () => { throw new Error("api down") } }
    const bad = await syncCatalog({
      sources: [{ name: "s", load: async () => [skill("pdf-tool", "acme/skills")] }],
      outDir: join(root, "catalog2"),
      stateDir: join(root, "state2"),
      now,
      vectors: { embedder: failing },
    })
    expect(bad.vectors?.warnings.join(" ")).toContain("api down")
    expect(bad.index.skills.length).toBeGreaterThan(0)
    expect(existsSync(join(root, "catalog2", "index.json"))).toBe(true)
  })
```

- [ ] **Step 2: Implement sync.ts + sync-bin.ts**

In `syncCatalog`, after `writeCatalog(...)` and before returning, add (exact shape; adapt names to the file's local variables):

```ts
  let vectors: { embedded: number; reused: number; warnings: string[] } | undefined
  if (opts.vectors) {
    try {
      const stats = await writeVectors(refined.records, opts.outDir, { embedder: opts.vectors.embedder, now })
      vectors = { ...stats, warnings: [] }
    } catch (error) {
      vectors = { embedded: 0, reused: refined.records.length, warnings: [error instanceof Error ? error.message : String(error)] }
    }
  }
```

Add `vectors` to the returned `SyncResult` and its type. (Import `writeVectors`, `type EmbeddingProvider`.)

In `sync-bin.ts`: add the `"no-vectors"` boolean option; after parsing flags:

```ts
let vectors: { embedder: EmbeddingProvider } | undefined
const vectorKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY
if (values["no-vectors"]) console.log("vectors: disabled by --no-vectors")
else if (vectorKey) {
  const embedder = makeGeminiEmbedder({ apiKey: vectorKey })
  vectors = { embedder }
  console.log(`vectors: ${embedder.model} @ ${embedder.dim} dims`)
} else console.log("vectors: skipped (no GOOGLE_API_KEY/GEMINI_API_KEY)")
```

Pass `vectors` into `syncCatalog(...)`; after the summary, print `vectors: embedded X, reused Y` and any warnings.

- [ ] **Step 3: Extend catalog-cache.ts import**

Open `packages/cli/src/catalog-cache.ts`, find the list of files copied by `importCatalog`, and add `"vectors.json"` and `"vectors.bin"` as conditional copies (skip silently when absent — read exactly how the existing files are copied and follow that pattern). Extend the existing import test with: vectors present → copied to the store; vectors absent → no error, no files.

- [ ] **Step 4: Run + commit**

Run: `npx vitest run packages/catalog/test/sync.test.ts packages/cli/test && npm run typecheck`
Commit: `feat(catalog): sync exports vector artifacts; import carries them to the store`

### Task 3: Retrieval core (pure ranking, selection, formatting)

**Files:**
- Create: `packages/plugin/src/retrieval-core.ts`
- Test: `packages/plugin/test/retrieval-core.test.ts`

**Interfaces:**
- `type RetrievalMode = "off" | "suggest" | "auto"`
- `type RetrievalSettings = { mode: RetrievalMode; embed: "gemini" | "off"; minScore: number; autoScore: number; maxPointers: number }`
- `DEFAULT_RETRIEVAL: RetrievalSettings = { mode: "suggest", embed: "gemini", minScore: 0.35, autoScore: 0.55, maxPointers: 5 }`
- `type CandidateInput = { id; name; description; tags: string[]; risk: string; total: number; ftsRank: number }`
- `rankCandidates(prompt, rows, queryVector?, vectors?): (CandidateInput & { score })[]` — vector present: `0.65·max(0,cos) + 0.35·(ftsRank/maxFts)`; lexical-only otherwise; +0.05 name-token hit, +0.03 tag hit; score clamped to [0,1], rounded to 3dp; sort score desc → total desc → id asc.
- `selectCandidates(candidates, settings)` — score ≥ minScore, top `maxPointers`.
- `formatRetrievalBlock(candidates)` — exact format below, `undefined` when empty.
- `pickAutoBody(candidates, settings)` — mode `auto` only; top candidate iff score ≥ autoScore.
- `dot` helper exported for reuse.

- [ ] **Step 1: Write the failing tests**

`packages/plugin/test/retrieval-core.test.ts`:

```ts
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
```

- [ ] **Step 2: Implement retrieval-core.ts**

`packages/plugin/src/retrieval-core.ts`:

```ts
export type RetrievalMode = "off" | "suggest" | "auto"

export type RetrievalSettings = {
  mode: RetrievalMode
  embed: "gemini" | "off"
  minScore: number
  autoScore: number
  maxPointers: number
}

export const DEFAULT_RETRIEVAL: RetrievalSettings = { mode: "suggest", embed: "gemini", minScore: 0.35, autoScore: 0.55, maxPointers: 5 }

export type CandidateInput = {
  id: string
  name: string
  description: string
  tags: string[]
  risk: string
  total: number
  ftsRank: number
}

export type Candidate = CandidateInput & { score: number }

export const dot = (a: Float32Array, b: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!
  return sum
}

const tokenize = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1)

export function rankCandidates(
  prompt: string,
  rows: CandidateInput[],
  queryVector: Float32Array | undefined,
  vectors: Map<string, Float32Array> | undefined,
): Candidate[] {
  const promptTokens = new Set(tokenize(prompt))
  const maxFts = Math.max(...rows.map((row) => row.ftsRank), 0.0001)
  return rows
    .map((row) => {
      const lexical = row.ftsRank > 0 ? row.ftsRank / maxFts : 0
      const vector = queryVector ? vectors?.get(row.id) : undefined
      let score = vector ? 0.65 * Math.max(0, dot(queryVector!, vector)) + 0.35 * lexical : lexical
      if (tokenize(row.name).some((token) => promptTokens.has(token))) score += 0.05
      if (row.tags.some((tag) => promptTokens.has(tag.toLowerCase()))) score += 0.03
      return { ...row, score: Math.min(1, Math.round(score * 1000) / 1000) }
    })
    .sort((a, b) => b.score - a.score || b.total - a.total || a.id.localeCompare(b.id))
}

export function selectCandidates(candidates: Candidate[], settings: RetrievalSettings): Candidate[] {
  return candidates.filter((candidate) => candidate.score >= settings.minScore).slice(0, settings.maxPointers)
}

const describeCandidate = (candidate: Candidate): string => {
  const description = candidate.description.length > 100 ? `${candidate.description.slice(0, 100).trimEnd()}…` : candidate.description
  return `- ${candidate.id} — ${candidate.name} (match ${candidate.score.toFixed(2)}, risk ${candidate.risk}): ${description}`
}

export function formatRetrievalBlock(candidates: Candidate[]): string | undefined {
  if (candidates.length === 0) return undefined
  return [
    "<skillhub-retrieval>",
    "Library skills that may help with this request (from the local SkillHub catalog):",
    ...candidates.map(describeCandidate),
    "Load one with skillhub_load(id) if it helps; ignore otherwise.",
    "</skillhub-retrieval>",
  ].join("\n")
}

export function pickAutoBody(candidates: Candidate[], settings: RetrievalSettings): Candidate | undefined {
  if (settings.mode !== "auto") return undefined
  const top = candidates[0]
  return top && top.score >= settings.autoScore ? top : undefined
}
```

- [ ] **Step 3: Run + commit**

Run: `npx vitest run packages/plugin/test/retrieval-core.test.ts && npm run typecheck`
Commit: `feat(plugin): retrieval ranking core (vector + lexical blend, block formatting)`

---

### Task 4: Settings + query embedder

**Files:**
- Create: `packages/plugin/src/settings.ts`, `packages/plugin/src/query-embedder.ts`
- Test: `packages/plugin/test/settings.test.ts`, `packages/plugin/test/query-embedder.test.ts`

**Interfaces:**
- `readRetrievalSettings(root, env?): RetrievalSettings` — reads `<root>/settings.json` → `{ retrieval?: Partial<RetrievalSettings> }`, merges over defaults field-by-field with validation; `env.SKILLHUB_RETRIEVAL` (`off|suggest|auto`) overrides mode; never throws.
- `makeQueryEmbedder({ apiKey?, model?, dim?, fetchImpl?, cacheSize? }): (text: string) => Promise<Float32Array | undefined>` — wraps the Gemini client; returns `undefined` on any failure or when no key; LRU cache (default 50, keyed by full prompt text).

- [ ] **Step 1: Write the failing tests**

`packages/plugin/test/settings.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_RETRIEVAL } from "../src/retrieval-core.ts"
import { readRetrievalSettings } from "../src/settings.ts"

const rootWith = (body: unknown) => {
  const root = mkdtempSync(join(tmpdir(), "skillhub-settings-"))
  if (body !== undefined) writeFileSync(join(root, "settings.json"), JSON.stringify(body))
  return root
}

describe("readRetrievalSettings", () => {
  it("defaults when the file is missing or malformed", () => {
    expect(readRetrievalSettings(rootWith(undefined))).toEqual(DEFAULT_RETRIEVAL)
    expect(readRetrievalSettings(rootWith("{ not json"))).toEqual(DEFAULT_RETRIEVAL)
  })

  it("merges valid partial settings and validates fields", () => {
    const settings = readRetrievalSettings(rootWith({ retrieval: { mode: "auto", embed: "off", minScore: 0.9, maxPointers: 3 } }))
    expect(settings).toEqual({ mode: "auto", embed: "off", minScore: 0.9, autoScore: DEFAULT_RETRIEVAL.autoScore, maxPointers: 3 })
    expect(readRetrievalSettings(rootWith({ retrieval: { mode: "wild", minScore: 12, maxPointers: 0 } }))).toEqual(DEFAULT_RETRIEVAL)
  })

  it("honours the env override", () => {
    const root = rootWith({ retrieval: { mode: "suggest" } })
    expect(readRetrievalSettings(root, { SKILLHUB_RETRIEVAL: "off" }).mode).toBe("off")
  })
})
```

`packages/plugin/test/query-embedder.test.ts`:

```ts
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
    expect(Array.from(first!)).toEqual([0.6, 0.8])
    const second = await embed("hello")
    expect(second).toBe(first)
    expect(calls).toBe(1)
  })
})
```

- [ ] **Step 2: Implement settings.ts**

`packages/plugin/src/settings.ts`:

```ts
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_RETRIEVAL, type RetrievalMode, type RetrievalSettings } from "./retrieval-core.ts"

const isMode = (value: unknown): value is RetrievalMode => value === "off" || value === "suggest" || value === "auto"
const ratio = (value: unknown, fallback: number): number => (typeof value === "number" && value >= 0 && value <= 1 ? value : fallback)

export function readRetrievalSettings(root: string, env: NodeJS.ProcessEnv = process.env): RetrievalSettings {
  let raw: Partial<RetrievalSettings> = {}
  const path = join(root, "settings.json")
  if (existsSync(path)) {
    try {
      raw = ((JSON.parse(readFileSync(path, "utf8")) as { retrieval?: Partial<RetrievalSettings> }).retrieval ?? {}) as Partial<RetrievalSettings>
    } catch {
      raw = {}
    }
  }
  const settings: RetrievalSettings = {
    mode: isMode(raw.mode) ? raw.mode : DEFAULT_RETRIEVAL.mode,
    embed: raw.embed === "off" ? "off" : DEFAULT_RETRIEVAL.embed,
    minScore: ratio(raw.minScore, DEFAULT_RETRIEVAL.minScore),
    autoScore: ratio(raw.autoScore, DEFAULT_RETRIEVAL.autoScore),
    maxPointers:
      typeof raw.maxPointers === "number" && raw.maxPointers >= 1 && raw.maxPointers <= 20 ? Math.trunc(raw.maxPointers) : DEFAULT_RETRIEVAL.maxPointers,
  }
  const envMode = env.SKILLHUB_RETRIEVAL
  if (isMode(envMode)) settings.mode = envMode
  return settings
}
```

- [ ] **Step 3: Implement query-embedder.ts**

`packages/plugin/src/query-embedder.ts`:

```ts
import { makeGeminiEmbedder } from "../../catalog/src/embeddings.ts"

export type QueryEmbedder = (text: string) => Promise<Float32Array | undefined>

export function makeQueryEmbedder(opts: {
  apiKey: string | undefined
  model?: string
  dim?: number
  fetchImpl?: typeof fetch
  cacheSize?: number
}): QueryEmbedder {
  const provider = opts.apiKey ? makeGeminiEmbedder({ apiKey: opts.apiKey, model: opts.model, dim: opts.dim, fetchImpl: opts.fetchImpl }) : undefined
  const cache = new Map<string, Float32Array>()
  const cacheSize = opts.cacheSize ?? 50
  return async (text) => {
    if (!provider) return undefined
    const hit = cache.get(text)
    if (hit) return hit
    try {
      const [vector] = await provider.embed([text])
      if (!vector) return undefined
      if (cache.size >= cacheSize) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(text, vector)
      return vector
    } catch {
      return undefined
    }
  }
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run packages/plugin/test/settings.test.ts packages/plugin/test/query-embedder.test.ts && npm run typecheck`
Commit: `feat(plugin): retrieval settings and cached query embedder`

---

### Task 5: The retrieval hook + plugin wiring + telemetry

**Files:**
- Create: `packages/plugin/src/retrieval-hook.ts`
- Modify: `packages/plugin/src/plugin.ts` (register `chat.message` capture + `experimental.chat.system.transform` injection with real deps)
- Modify: `packages/plugin/src/manage-core.ts` (add `recordSuggestion`, following the existing `recordSearch` pattern — read the file first)
- Test: `packages/plugin/test/retrieval-hook.test.ts`, extend `packages/plugin/test/manage.test.ts`

**Interfaces:**
- `makeRetrievalTransform(deps, state): (input, output) => Promise<void>` where `deps = { search; embed; loadVectors; readBody; tagsFor; settings; onSuggestion; onAutoLoad }` and `state = { prompt?: string }`. Behaviour: mode `off` or empty prompt → no-op; clears `state.prompt` before work; embeds when `embed === "gemini"`; searches top 10; ranks + selects; no candidates → no-op; appends exactly one `<skillhub-retrieval>` block to `output.system`; auto mode appends `\n\n[auto-loaded <id>]\n<body slice 8000>` and fires `onAutoLoad`; any thrown error is swallowed (fail-open).
- `promptFromChatMessage(input, output): string | undefined` — extracts the latest user text; implementer inspects `node_modules/@opencode-ai/plugin` types and adapts to the real hook payload, keeping this helper pure and tested with representative shapes.
- `recordSuggestion(file, ids, at)` in manage-core (mirror `recordSearch`).

- [ ] **Step 1: Write the failing hook tests**

`packages/plugin/test/retrieval-hook.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { DEFAULT_RETRIEVAL } from "../src/retrieval-core.ts"
import { makeRetrievalTransform } from "../src/retrieval-hook.ts"

const deps = (over: Partial<Parameters<typeof makeRetrievalTransform>[0]> = {}) => ({
  search: async () => [
    { id: "weizhena-deep-research-skills/research", name: "research", description: "deep web research", category: "research", risk: "low", total: 78, rank: 2 },
  ],
  embed: async () => Float32Array.from([1, 0, 0]),
  loadVectors: () =>
    new Map([["weizhena-deep-research-skills/research", Float32Array.from([1, 0, 0])]]) as Map<string, Float32Array>,
  readBody: () => "# Research\nsteps",
  tagsFor: () => ["research"],
  settings: () => DEFAULT_RETRIEVAL,
  onSuggestion: () => {},
  onAutoLoad: () => {},
  ...over,
})

describe("makeRetrievalTransform", () => {
  it("appends a retrieval block for a matching prompt and consumes the prompt", async () => {
    const state = { prompt: "I need deep web research for a report" }
    const output = { system: ["base"] as string[] }
    const suggestions: string[][] = []
    await makeRetrievalTransform(deps({ onSuggestion: (ids) => void suggestions.push(ids) }), state)({}, output)
    expect(state.prompt).toBeUndefined()
    expect(output.system).toHaveLength(2)
    expect(output.system[1]).toContain("<skillhub-retrieval>")
    expect(output.system[1]).toContain("weizhena-deep-research-skills/research")
    expect(suggestions).toEqual([["weizhena-deep-research-skills/research"]])
  })

  it("does nothing when the mode is off, the prompt is empty, or nothing matches", async () => {
    for (const [state, d] of [
      [{ prompt: "x" }, deps({ settings: () => ({ ...DEFAULT_RETRIEVAL, mode: "off" as const }) })],
      [{}, deps()],
      [{ prompt: "x" }, deps({ search: async () => [] })],
    ] as const) {
      const output = { system: ["base"] as string[] }
      await makeRetrievalTransform(d as never, state as never)({}, output)
      expect(output.system).toHaveLength(1)
    }
  })

  it("fails open when the embedder or the deps throw", async () => {
    const failing = deps({
      embed: async () => {
        throw new Error("down")
      },
      search: async () => {
        throw new Error("down")
      },
    })
    const output = { system: ["base"] as string[] }
    await makeRetrievalTransform(failing, { prompt: "x" })({}, output)
    expect(output.system).toHaveLength(1)
  })

  it("auto mode appends one body and records it", async () => {
    const loaded: string[] = []
    const d = deps({ settings: () => ({ ...DEFAULT_RETRIEVAL, mode: "auto" as const, minScore: 0 }), onAutoLoad: (id) => void loaded.push(id) })
    const output = { system: ["base"] as string[] }
    await makeRetrievalTransform(d, { prompt: "research please" })({}, output)
    expect(output.system[1]).toContain("[auto-loaded")
    expect(output.system[1]).toContain("# Research")
    expect(loaded).toEqual(["weizhena-deep-research-skills/research"])
  })
})
```

- [ ] **Step 2: Implement retrieval-hook.ts**

`packages/plugin/src/retrieval-hook.ts`:

```ts
import { formatRetrievalBlock, pickAutoBody, rankCandidates, selectCandidates, type CandidateInput, type RetrievalSettings } from "./retrieval-core.ts"

export type RetrievalSearchRow = { id: string; name: string; description: string; category: string; risk: string; total: number; rank: number }

export type RetrievalDeps = {
  search: (query: string, limit: number) => Promise<RetrievalSearchRow[]>
  embed: (text: string) => Promise<Float32Array | undefined>
  loadVectors: () => Map<string, Float32Array> | undefined
  readBody: (id: string) => string | undefined
  tagsFor: (id: string) => string[]
  settings: () => RetrievalSettings
  onSuggestion: (ids: string[], autoLoaded?: string) => void
  onAutoLoad: (id: string) => void
}

export function makeRetrievalTransform(deps: RetrievalDeps, state: { prompt?: string }) {
  return async (_input: unknown, output: { system: string[] }): Promise<void> => {
    const settings = deps.settings()
    const prompt = state.prompt
    state.prompt = undefined
    if (settings.mode === "off" || !prompt || prompt.trim() === "") return
    try {
      const queryVector = settings.embed === "gemini" ? await deps.embed(prompt) : undefined
      const rows = await deps.search(prompt, 10)
      if (rows.length === 0) return
      const inputs: CandidateInput[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        tags: deps.tagsFor(row.id),
        risk: row.risk,
        total: row.total,
        ftsRank: row.rank,
      }))
      const candidates = selectCandidates(rankCandidates(prompt, inputs, queryVector, deps.loadVectors()), settings)
      const block = formatRetrievalBlock(candidates)
      if (!block) return
      let text = block
      const auto = pickAutoBody(candidates, settings)
      if (auto) {
        const body = deps.readBody(auto.id)
        if (body) {
          text += `\n\n[auto-loaded ${auto.id}]\n${body.slice(0, 8000)}`
          deps.onAutoLoad(auto.id)
        }
      }
      output.system.push(text)
      deps.onSuggestion(candidates.map((candidate) => candidate.id), auto?.id)
    } catch {
      // fail-open: retrieval must never block a turn
    }
  }
}

/** Best-effort extraction of the latest user text from a chat.message payload. */
export function promptFromChatMessage(input: unknown, output: unknown): string | undefined {
  const candidate = output as { message?: { parts?: unknown[] }; parts?: unknown[] } | undefined
  const parts = candidate?.message?.parts ?? candidate?.parts ?? (input as { message?: { parts?: unknown[] } })?.message?.parts
  if (!Array.isArray(parts)) return undefined
  const texts = parts.flatMap((part) => {
    const p = part as { type?: string; text?: string }
    return p?.type === "text" && typeof p.text === "string" ? [p.text] : []
  })
  return texts.join("\n").trim() || undefined
}
```

The implementer adapts `promptFromChatMessage` to the real `chat.message` payload after inspecting `@opencode-ai/plugin` types, keeping the tests' representative shapes passing (or updating tests to the real shape with equal rigor).

- [ ] **Step 3: Wire plugin.ts + manage-core**

In `manage-core.ts`, add (mirroring `recordSearch`; adjust to the file's real shape):

```ts
export function recordSuggestion(file: string, ids: string[], at: Date): void
```

In `plugin.ts`: module-level `const retrievalState: { prompt?: string } = {}`; build `retrievalTags` lazily from `readCatalogIndex(root)` (id → tags map); `loadVectors` reads `<root>/catalog` via `readVectors` once per process (retry when absent); `embed = makeQueryEmbedder({ apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY })`; register hooks:

```ts
    "chat.message": async (input, output) => {
      const prompt = promptFromChatMessage(input, output)
      if (prompt) retrievalState.prompt = prompt
    },
    "experimental.chat.system.transform": makeRetrievalTransform(
      {
        search: (query, limit) => searchRuntime(root, query, limit),
        embed,
        loadVectors,
        readBody: (id) => readSkillBodyFromDisk(root, id),
        tagsFor: (id) => retrievalTags().get(id) ?? [],
        settings: () => readRetrievalSettings(root),
        onSuggestion: (ids) => {
          try { recordSuggestion(usageFileFor(root, directory), ids, new Date()) } catch {}
        },
        onAutoLoad: (id) => {
          try { recordLoad(usageFileFor(root, directory), id, new Date()) } catch {}
        },
      },
      retrievalState,
    ),
```

`readSkillBodyFromDisk` returns the body synchronously in the existing code — if it is async, adapt the hook to `await deps.readBody(...)` (keep the `RetrievalDeps.readBody` type consistent between hook and wiring).

- [ ] **Step 4: Run the full plugin suite + typecheck, commit**

Run: `npx vitest run packages/plugin/test && npm test 2>&1 | Select-String "Tests " && npm run typecheck`
Commit: `feat(plugin): prompt-time retrieval injection with fail-open fallback`

---

### Task 6: Acceptance — real vectors, precision, live smoke, docs

**Files:**
- Modify: `README.md` (retrieval section + privacy/opt-out, master-writer pass), `docs/superpowers/plans/2026-10-05-skillhub-steroids-v1-roadmap.md` (Slice 2 status), and the plan's own status notes
- No code changes expected; fix forward only if acceptance finds real defects (then re-review as usual)

- [ ] **Step 1: Generate real vectors into the real store**

From the worktree (network + Gemini, ≈ cents):

```powershell
$skillhome = "E:\Users\ethan\.config\opencode\.skillhub"
npm run catalog:sync -- --topics claude-skills,opencode-skills --max-repos 6 --max-skills 5 --agentskills https://agentskills.codes --agentskills-limit 30 --out "$skillhome\catalog" --state "$skillhome\catalog\state"
```

Expected: `vectors: gemini-embedding-001 @ 768 dims`, `vectors: embedded N, reused M`, and `vectors.bin`/`vectors.json` in the store catalog. Second run: `embedded 0, reused N` (delta-only proof).

- [ ] **Step 2: In-process retrieval harness (pre-merge, real deps from the worktree)**

Run a one-off Node harness that builds the real transform with worktree code against the real store and a research-flavoured prompt; print the injected block and its estimated size. Assert the block exists and contains at least one catalog id. Then repeat with a deliberately broken key (`GOOGLE_API_KEY=bad`) to prove lexical-only fail-open still yields a block. Record both outputs.

- [ ] **Step 3: Precision fixture (once, live, cheap)**

Take 10 representative prompts mapped to expected catalog ids (drawn from the store's index), run each through the real ranker (embed + FTS), and record top-3 hit-rate. Report the number and the minScore in use; tune `minScore` once if the measured precision says so (one settings change, re-run the fixture, record both).

- [ ] **Step 4: Docs + roadmap status, commit**

README: add "Automatic retrieval" under The dashboard/How it works: what it does, the default `suggest`, how to opt into `auto`, the privacy line ("when retrieval is on, your prompt is sent to Google's embeddings endpoint; set `retrieval.embed` to `off` to keep it local/lexical-only"), and the cost note (pennies). Roadmap: mark Slice 2 done (with date) and note the measured precision + any decision gates hit. Commit: `docs: automatic retrieval section, privacy note, slice 2 status`.

- [ ] **Step 5: Final gate**

`npm test` (expect prior 244/4 + new tests), `npm run typecheck`, then the post-merge real-profile smoke in Task 7 of the SDD flow (`opencode run` with `SKILLHUB_CAPTURE_DIR`, assert `<skillhub-retrieval>` in the captured system prompt with a real catalog id).

## Acceptance

- [ ] Unit: embeddings chunking/retry/normalization; vectors delta-only round-trip; ranking blend/threshold/determinism; settings validation + env; embedder cache/fail-open; hook behaviours incl. auto body and total failure.
- [ ] Sync: vector artifacts written when configured, warnings not failures; `importCatalog` carries them; second sync reuses all vectors.
- [ ] Live store: `vectors.json`/`vectors.bin` present; delta re-run embeds 0.
- [ ] Retrieval quality: precision fixture measured and recorded; thresholds set from the measurement, not guessed.
- [ ] Fail-open: broken key still yields a lexical block; a fully failing deps set yields no block and no thrown error.
- [ ] Budget: typical block ≤ ~200 tokens (5 pointers); auto body ≤ 8k chars, one per turn.
- [ ] `npm test` + `npm run typecheck` clean; plugin suites green.
- [ ] Docs: README retrieval + privacy + cost; roadmap Slice 2 status.

## Open items carried to Slice 3+

- Upgrade suggestions + session-start notifications (Slice 3) consume the `suggested` telemetry recorded here.
- Retrieval quality review after a week of real use decides whether `auto` becomes the default or thresholds adjust.
- Vector scale gate: at >20k skills or `vectors.bin` >50MB, move to sqlite-vec/ANN (recorded in roadmap).

