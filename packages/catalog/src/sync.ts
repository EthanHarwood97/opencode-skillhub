import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { BuildSummary } from "./build.ts"
import { normalizeAll } from "./build.ts"
import { composeTotal } from "./calibrate.ts"
import { readClusterState, refineClusters, writeClusterState, type ClusterState } from "./cluster-refine.ts"
import { curateRecords, readCurationCache, renderBrief, writeCurationCache, type CurateFn, type CurationReport } from "./curate.ts"
import type { Embedder } from "./embed.ts"
import type { EmbeddingProvider } from "./embeddings.ts"
import { readEvalCache, writeEvalCache } from "./eval-cache.ts"
import { evaluateRecords, type EvaluateFn, type EvaluateStats } from "./evaluate.ts"
import { writeCatalog, type CatalogIndex } from "./publish.ts"
import { reconcile, type ReconciliationFile, type SourceStat } from "./reconcile.ts"
import type { ScoreWeights } from "./score.ts"
import type { Candidate } from "./sources/types.ts"
import { computeTrending, readSnapshots, snapshotFromRecords, writeSnapshot, type TrendingFile } from "./trending.ts"
import type { SkillRecord } from "./types.ts"
import { removeVectors, writeVectors } from "./vectors.ts"

export type SyncSource = { name: string; load: () => Promise<Candidate[] | { candidates: Candidate[]; warnings?: string[] }> }

export type SyncSummary = {
  candidates: number
  published: number
  quarantined: number
  rejected: number
  evaluated: number
  failed: number
  cached: number
  skippedBudget: number
  spentUsd: number
  duplicates: number
  topRejections: { reason: string; count: number }[]
}

export type SyncResult = {
  summary: SyncSummary
  index: CatalogIndex
  trending: TrendingFile
  reconciliation: ReconciliationFile
  clusterState: ClusterState
  evalStats?: EvaluateStats
  vectors?: { embedded: number; reused: number; warnings: string[] }
  curation?: CurationReport
}

const readIndex = (outDir: string): CatalogIndex | undefined => {
  const path = join(outDir, "index.json")
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, "utf8")) as CatalogIndex
}

const rescoreAll = (records: SkillRecord[], weights: ScoreWeights): SkillRecord[] =>
  records.map((record) => ({ ...record, scores: { ...record.scores, total: composeTotal(record.scores, weights) } }))

export async function syncCatalog(opts: {
  sources: SyncSource[]
  outDir: string
  stateDir: string
  now?: Date
  weights?: ScoreWeights
  evaluation?: { evaluate: EvaluateFn; maxEvals?: number; maxUsd?: number; costPerEvalUsd?: number }
  curation?: { curate: CurateFn; maxItems?: number; maxUsd?: number; costPerItemUsd?: number }
  cluster?: { k?: number; seed?: number; dupThreshold?: number }
  embed?: Embedder
  vectors?: { embedder: EmbeddingProvider }
}): Promise<SyncResult> {
  const now = opts.now ?? new Date()
  const sourceStats: SourceStat[] = []
  const candidates: Candidate[] = []

  for (const source of opts.sources) {
    try {
      const loaded = await source.load()
      const loadedCandidates = Array.isArray(loaded) ? loaded : loaded.candidates
      const warnings = Array.isArray(loaded) ? [] : loaded.warnings ?? []
      candidates.push(...loadedCandidates)
      sourceStats.push({
        source: source.name,
        candidates: loadedCandidates.length,
        fetchedAt: now.toISOString(),
        ...(warnings.length > 0 ? { warnings } : {}),
      })
    } catch (error) {
      sourceStats.push({
        source: source.name,
        candidates: 0,
        fetchedAt: now.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const { records, rejected, bodies } = normalizeAll(candidates, { now })
  const rejectionCounts = new Map<string, number>()
  for (const entry of rejected) {
    const reason = (entry.reason.split(";")[0] ?? entry.reason).split(":").slice(0, 1).join(":").trim().slice(0, 80)
    rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1)
  }
  const topRejections = [...rejectionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }))

  let evaluated: SkillRecord[] = records
  let evalStats: EvaluateStats | undefined
  if (opts.evaluation) {
    const cacheFile = join(opts.stateDir, "eval-cache.json")
    const result = await evaluateRecords(records, {
      cache: readEvalCache(cacheFile),
      evaluate: opts.evaluation.evaluate,
      bodies,
      maxEvals: opts.evaluation.maxEvals,
      maxUsd: opts.evaluation.maxUsd,
      costPerEvalUsd: opts.evaluation.costPerEvalUsd,
      weights: opts.weights,
      now,
    })
    evaluated = result.records
    evalStats = result.stats
    writeEvalCache(cacheFile, result.cache)
  }
  if (opts.weights) evaluated = rescoreAll(evaluated, opts.weights)

  let curated = evaluated
  let curation: CurationReport | undefined
  if (opts.curation) {
    const cacheFile = join(opts.stateDir, "curation-cache.json")
    const result = await curateRecords(evaluated, {
      cache: readCurationCache(cacheFile),
      curate: opts.curation.curate,
      bodies,
      maxItems: opts.curation.maxItems,
      maxUsd: opts.curation.maxUsd,
      costPerItemUsd: opts.curation.costPerItemUsd,
      now,
    })
    curated = result.records
    curation = result.report
    writeCurationCache(cacheFile, result.cache)
  }

  const stateFile = join(opts.stateDir, "clusters-state.json")
  const refined = refineClusters(curated, {
    prev: readClusterState(stateFile),
    k: opts.cluster?.k,
    seed: opts.cluster?.seed,
    dupThreshold: opts.cluster?.dupThreshold,
    embed: opts.embed,
    now,
  })
  writeClusterState(stateFile, refined.state)

  const previousIndex = readIndex(opts.outDir)
  const trending = computeTrending(refined.records, { snapshots: readSnapshots(opts.stateDir), now })
  const reconciliation = reconcile({ previous: previousIndex, current: refined.records, sourceStats, now })
  const { index } = writeCatalog(refined.records, opts.outDir, now, { trending, reconciliation })
  writeSnapshot(opts.stateDir, snapshotFromRecords(refined.records, now))
  if (curation) {
    writeFileSync(join(opts.outDir, "curation.json"), JSON.stringify(curation, null, 2) + "\n")
    writeFileSync(join(opts.outDir, "brief.md"), renderBrief(curation))
  }

  let vectors: { embedded: number; reused: number; warnings: string[] } | undefined
  if (opts.vectors) {
    try {
      vectors = await writeVectors(refined.records, opts.outDir, { embedder: opts.vectors.embedder, now })
    } catch (error) {
      removeVectors(opts.outDir)
      vectors = { embedded: 0, reused: refined.records.length, warnings: [error instanceof Error ? error.message : String(error)] }
    }
  } else {
    removeVectors(opts.outDir)
  }

  return {
    summary: {
      candidates: candidates.length,
      published: refined.records.filter((record) => record.status === "candidate").length,
      quarantined: refined.records.filter((record) => record.status === "quarantined").length,
      rejected: rejected.length,
      evaluated: evalStats?.evaluated ?? 0,
      failed: evalStats?.failed ?? 0,
      cached: evalStats?.cached ?? 0,
      skippedBudget: evalStats?.skippedBudget ?? 0,
      spentUsd: evalStats?.spentUsd ?? 0,
      duplicates: refined.duplicates.length,
      topRejections,
    },
    index,
    trending,
    reconciliation,
    clusterState: refined.state,
    evalStats,
    vectors,
    curation,
  }
}
