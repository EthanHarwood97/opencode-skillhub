import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { cosine, embedText, type Embedder } from "./embed.ts"
import { sha256 } from "./parse.ts"
import type { SkillRecord } from "./types.ts"

export type ClusterState = {
  version: 1
  generatedAt: string
  clusters: { id: string; label: string; centroid: number[] }[]
}

export function readClusterState(file: string): ClusterState | undefined {
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, "utf8")) as ClusterState
}

export function writeClusterState(file: string, state: ClusterState): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n")
}

const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Deterministic k-means++ over unit vectors. Empty clusters keep their previous centroid. */
export function kmeans(vectors: Float64Array[], k: number, seed: number, iters = 25): { centroids: Float64Array[]; assignments: number[] } {
  const n = vectors.length
  const dim = vectors[0]?.length ?? 0
  const kk = Math.max(1, Math.min(k, n))
  const rng = mulberry32(seed)

  const centroids: Float64Array[] = [Float64Array.from(vectors[0]!)]
  while (centroids.length < kk) {
    const distances = vectors.map((v) => {
      let best = Number.POSITIVE_INFINITY
      for (const c of centroids) best = Math.min(best, 1 - cosine(v, c))
      return Math.max(0, best)
    })
    const total = distances.reduce((s, d) => s + d, 0)
    let target = total > 0 ? rng() * total : 0
    let index = 0
    for (let i = 0; i < n; i++) {
      target -= distances[i]!
      index = i
      if (target <= 0) break
    }
    centroids.push(Float64Array.from(vectors[index]!))
  }

  const assignments = new Array<number>(n).fill(0)
  for (let iter = 0; iter < iters; iter++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestSimilarity = Number.NEGATIVE_INFINITY
      for (let c = 0; c < centroids.length; c++) {
        const similarity = cosine(vectors[i]!, centroids[c]!)
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity
          best = c
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best
        changed = true
      }
    }
    const sums = centroids.map(() => new Float64Array(dim))
    const counts = new Array<number>(centroids.length).fill(0)
    for (let i = 0; i < n; i++) {
      const c = assignments[i]!
      counts[c]!++
      const sum = sums[c]!
      for (let d = 0; d < dim; d++) sum[d] += vectors[i]![d]!
    }
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c] === 0) continue
      const next = new Float64Array(dim)
      let norm = 0
      for (let d = 0; d < dim; d++) {
        next[d] = sums[c]![d]! / counts[c]!
        norm += next[d]! * next[d]!
      }
      norm = Math.sqrt(norm)
      if (norm > 0) for (let d = 0; d < dim; d++) next[d] = next[d]! / norm
      centroids[c] = next
    }
    if (!changed && iter > 0) break
  }
  return { centroids, assignments }
}

const displayLabel = (tag: string) => tag.replace(/\b\w/g, (c) => c.toUpperCase())

export type RefineResult = {
  records: SkillRecord[]
  state: ClusterState
  assignments: Record<string, string>
  duplicates: { canonical: string; duplicate: string }[]
}

export function refineClusters(
  records: SkillRecord[],
  opts: { embed?: Embedder; k?: number; seed?: number; prev?: ClusterState; dupThreshold?: number; now: Date },
): RefineResult {
  const embed = opts.embed ?? ((text: string) => embedText(text))
  if (records.length === 0) {
    return { records, state: { version: 1, generatedAt: opts.now.toISOString(), clusters: [] }, assignments: {}, duplicates: [] }
  }

  const vectors = records.map((record) => embed(`${record.name} ${record.description} ${record.tags.join(" ")}`))
  const k = opts.k ?? (Math.round(Math.sqrt(records.length)) || 1)
  const { centroids, assignments: memberOf } = kmeans(vectors, k, opts.seed ?? 42)

  const prevById = new Map((opts.prev?.clusters ?? []).map((c) => [c.id, c]))
  const used = new Set<string>()
  const clusters = centroids.map((centroid, index) => {
    const memberIndexes = records.map((_, i) => i).filter((i) => memberOf[i] === index)
    let id: string | undefined
    let label: string | undefined
    if (opts.prev) {
      let best: { id: string; similarity: number } | undefined
      for (const prev of opts.prev.clusters) {
        if (used.has(prev.id)) continue
        const similarity = cosine(centroid, Float64Array.from(prev.centroid))
        if (!best || similarity > best.similarity) best = { id: prev.id, similarity }
      }
      if (best && best.similarity >= 0.75) {
        id = best.id
        label = prevById.get(best.id)?.label
        used.add(id)
      }
    }
    if (!id) id = `c-${sha256(memberIndexes.map((i) => records[i]!.id).sort().join(",")).slice(0, 8)}`
    if (!label) {
      const tagCounts = new Map<string, number>()
      for (const i of memberIndexes) for (const tag of records[i]!.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      label = displayLabel([...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "general")
    }
    return { id, label, centroid: Array.from(centroid, (v) => Math.round(v * 10_000) / 10_000), memberIndexes }
  })

  const clusterOf = new Map<string, string>()
  const recordCluster = new Map<number, { id: string; label: string }>()
  for (const cluster of clusters) {
    for (const i of cluster.memberIndexes) {
      clusterOf.set(records[i]!.id, cluster.id)
      recordCluster.set(i, { id: cluster.id, label: cluster.label })
    }
  }

  const dupThreshold = opts.dupThreshold ?? 0.97
  const duplicates: { canonical: string; duplicate: string }[] = []
  const duplicateOf = new Map<number, number>()
  for (const cluster of clusters) {
    const members = [...cluster.memberIndexes]
      .sort((a, b) => records[b]!.scores.total - records[a]!.scores.total || records[a]!.id.localeCompare(records[b]!.id))
      .slice(0, 200)
    for (let x = 0; x < members.length; x++) {
      for (let y = x + 1; y < members.length; y++) {
        const canonical = members[x]!
        const candidate = members[y]!
        if (duplicateOf.has(canonical) || duplicateOf.has(candidate)) continue
        if (cosine(vectors[canonical]!, vectors[candidate]!) >= dupThreshold) {
          duplicateOf.set(candidate, canonical)
          duplicates.push({ canonical: records[canonical]!.id, duplicate: records[candidate]!.id })
        }
      }
    }
  }

  const linked = new Map<number, string[]>()
  for (const [duplicate, canonical] of duplicateOf) {
    const list = linked.get(canonical) ?? []
    list.push(records[duplicate]!.id)
    linked.set(canonical, list)
  }

  const out = records.map((record, index) => {
    const cluster = recordCluster.get(index)!
    const canonicalForMe = duplicateOf.get(index)
    const relations =
      canonicalForMe !== undefined
        ? { ...record.relations, duplicates: [records[canonicalForMe]!.id] }
        : linked.has(index)
          ? { ...record.relations, duplicates: linked.get(index)!.sort() }
          : record.relations
    return { ...record, clusterId: cluster.id, clusterLabel: cluster.label, relations }
  })

  return {
    records: out,
    state: {
      version: 1,
      generatedAt: opts.now.toISOString(),
      clusters: clusters.map((c) => ({ id: c.id, label: c.label, centroid: c.centroid })),
    },
    assignments: Object.fromEntries([...clusterOf.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    duplicates,
  }
}
