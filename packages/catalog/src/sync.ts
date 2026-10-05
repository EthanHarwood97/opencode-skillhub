import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { BuildSummary } from "./build.ts"
import { normalizeAll } from "./build.ts"
import { composeTotal } from "./calibrate.ts"
import { readClusterState, refineClusters, writeClusterState, type ClusterState } from "./cluster-refine.ts"
import type { Embedder } from "./embed.ts"
import { readEvalCache, writeEvalCache } from "./eval-cache.ts"
import { evaluateRecords, type EvaluateFn, type EvaluateStats } from "./evaluate.ts"
import { writeCatalog, type CatalogIndex } from "./publish.ts"
import { reconcile, type ReconciliationFile, type SourceStat } from "./reconcile.ts"
import type { ScoreWeights } from "./score.ts"
import type { Candidate } from "./sources/types.ts"
import { computeTrending, readSnapshots, snapshotFromRecords, writeSnapshot, type TrendingFile } from "./trending.ts"
import type { SkillRecord } from "./types.ts"

export type SyncSource = { name: string; load: () => Promise<Candidate[]> }

export type SyncSummary = {
  candidates: number
  published: number
  quarantined: number
  rejected: number
  evaluated: number
  cached: number
  skippedBudget: number
  spentUsd: number
  duplicates: number
}

export type SyncResult = {
  summary: SyncSummary
  index: CatalogIndex
  trending: TrendingFile
  reconciliation: ReconciliationFile
  clusterState: ClusterState
  evalStats?: EvaluateStats
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
  cluster?: { k?: number; seed?: number; dupThreshold?: number }
  embed?: Embedder
}): Promise<SyncResult> {
  const now = opts.now ?? new Date()
  const sourceStats: SourceStat[] = []
  const candidates: Candidate[] = []

  for (const source of opts.sources) {
    try {
      const loaded = await source.load()
      candidates.push(...loaded)
      sourceStats.push({ source: source.name, candidates: loaded.length, fetchedAt: now.toISOString() })
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
  } else if (opts.weights) {
    evaluated = rescoreAll(records, opts.weights)
  }

  const stateFile = join(opts.stateDir, "clusters-state.json")
  const refined = refineClusters(evaluated, {
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

  return {
    summary: {
      candidates: candidates.length,
      published: refined.records.filter((record) => record.status === "candidate").length,
      quarantined: refined.records.filter((record) => record.status === "quarantined").length,
      rejected: rejected.length,
      evaluated: evalStats?.evaluated ?? 0,
      cached: evalStats?.cached ?? 0,
      skippedBudget: evalStats?.skippedBudget ?? 0,
      spentUsd: evalStats?.spentUsd ?? 0,
      duplicates: refined.duplicates.length,
    },
    index,
    trending,
    reconciliation,
    clusterState: refined.state,
    evalStats,
  }
}
