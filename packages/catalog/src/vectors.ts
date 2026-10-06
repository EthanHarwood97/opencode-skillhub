import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { EmbeddingProvider } from "./embeddings.ts"
import type { SkillRecord } from "./types.ts"

export const VECTORS_VERSION = 1

export function removeVectors(outDir: string): void {
  try {
    rmSync(join(outDir, "vectors.json"), { force: true })
  } catch {}
  try {
    rmSync(join(outDir, "vectors.bin"), { force: true })
  } catch {}
}

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
    if (meta.version !== VECTORS_VERSION || !Number.isInteger(meta.dim) || meta.dim <= 0 || !Array.isArray(meta.ids) || buf.length !== meta.ids.length * meta.dim * 4) {
      return undefined
    }
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
): Promise<{ embedded: number; reused: number; warnings: string[] }> {
  const previous = readVectors(outDir)
  const reusable =
    previous &&
    previous.meta.version === VECTORS_VERSION &&
    previous.meta.provider === opts.embedder.name &&
    previous.meta.model === opts.embedder.model &&
    previous.meta.dim === opts.embedder.dim
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

  const warnings: string[] = []
  let embedded = 0
  if (missing.length > 0) {
    try {
      const fresh = await opts.embedder.embed(missing.map((entry) => entry.text))
      fresh.forEach((vector, index) => byHash.set(missing[index]!.hash, vector))
      embedded = missing.length
    } catch (error) {
      warnings.push(`embedded 0 of ${missing.length} new vectors: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  mkdirSync(outDir, { recursive: true })
  const dim = opts.embedder.dim
  const bin = Buffer.alloc(records.length * dim * 4)
  records.forEach((record, index) => {
    const vector = byHash.get(record.contentHash)
    if (!vector) return
    if (vector.length !== dim) throw new Error("embedding dimension mismatch")
    Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).copy(bin, index * dim * 4)
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
  return { embedded, reused: records.length - embedded, warnings }
}
