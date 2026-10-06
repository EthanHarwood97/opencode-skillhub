import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ClustersFile } from "../../../catalog/src/cluster-types.ts"
import type { CatalogIndex } from "../../../catalog/src/publish.ts"
import type { ReconciliationFile } from "../../../catalog/src/reconcile.ts"
import type { TrendingFile } from "../../../catalog/src/trending.ts"
import type { SkillRecord } from "../../../catalog/src/types.ts"
import { computeCoverage, GOAL_PROFILES } from "../../../catalog/src/coverage.ts"
import { computeUpgradeSuggestions } from "../../../catalog/src/upgrades.ts"
import { filterSkills } from "../../../ui/src/lib/filter.ts"
import type {
  ClustersDto,
  ReviewDto,
  SkillCard,
  SkillDetail,
  SkillsPageDto,
  SkillsQuery,
  StatusDto,
  TrendingDto,
} from "../../../ui/src/lib/contract.ts"
import { readLockfile, type Lockfile } from "../lockfile.ts"
import type { StoreLayout } from "../paths.ts"

export type UiSnapshot = {
  index: CatalogIndex
  lock: Lockfile
  clusters?: ClustersFile
  trending?: TrendingFile
  reconciliation?: ReconciliationFile
  warnings: string[]
}

const readOptional = <T>(path: string, warnings: string[]): T | undefined => {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch (error) {
    warnings.push(`could not read ${path}: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

const readLock = (path: string, warnings: string[]): Lockfile => {
  try {
    return readLockfile(path)
  } catch (error) {
    warnings.push(`could not read ${path}: ${error instanceof Error ? error.message : String(error)}`)
    return { version: 1, skills: {} }
  }
}

export function loadSnapshot(l: StoreLayout, catalogDir: string = l.catalogDir): UiSnapshot | { error: string } {
  const indexPath = join(catalogDir, "index.json")
  if (!existsSync(indexPath)) {
    return { error: `no catalog at ${catalogDir} — run "npm run catalog:sync", then "skillhub catalog import <dir>"` }
  }
  const warnings: string[] = []
  const index = readOptional<CatalogIndex>(indexPath, warnings)
  if (!index) return { error: `catalog index at ${indexPath} is unreadable` }
  return {
    index,
    lock: readLock(l.lockfilePath, warnings),
    clusters: readOptional<ClustersFile>(join(catalogDir, "clusters.json"), warnings),
    trending: readOptional<TrendingFile>(join(catalogDir, "trending.json"), warnings),
    reconciliation: readOptional<ReconciliationFile>(join(catalogDir, "reconciliation.json"), warnings),
    warnings,
  }
}

export function toCard(record: SkillRecord, lock: Lockfile): SkillCard {
  const entry = lock.skills[record.id]
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    category: record.category,
    labels: record.labels ?? [],
    tags: record.tags,
    clusterId: record.clusterId,
    clusterLabel: record.clusterLabel,
    total: record.scores.total,
    freshness: record.scores.freshness,
    risk: record.risk.level,
    provenance: record.provenanceTier,
    status: record.status,
    sourceKind: record.source.kind,
    ...(record.source.repo ? { sourceRepo: record.source.repo } : {}),
    installed: entry !== undefined,
    active: entry?.active ?? false,
    updateAvailable: entry !== undefined && entry.contentHash !== record.contentHash && record.status === "candidate",
  }
}

export function toDetail(record: SkillRecord, lock: Lockfile): SkillDetail {
  return {
    ...toCard(record, lock),
    scores: record.scores,
    riskFindings: record.risk.findings.map((finding) => ({ rule: finding.rule, severity: finding.severity, line: finding.line, match: finding.match })),
    requires: record.requires,
    files: record.files.map((file) => ({ path: file.path, size: file.size })),
    relations: record.relations,
    source: record.source,
    signals: record.signals,
    ...(record.summaryDerived !== undefined ? { summaryDerived: record.summaryDerived } : {}),
  }
}

const uninstalledTop = (top: { id: string; name: string; total: number }[], lock: Lockfile) =>
  top.filter((skill) => lock.skills[skill.id] === undefined)

export function buildStatus(snapshot: UiSnapshot): StatusDto {
  const entries = Object.values(snapshot.lock.skills)
  const cards = snapshot.index.skills.map((record) => toCard(record, snapshot.lock))
  return {
    generatedAt: snapshot.index.generatedAt,
    counts: snapshot.index.counts,
    installed: entries.length,
    active: entries.filter((entry) => entry.active).length,
    updates: cards.filter((card) => card.updateAvailable).length,
    reviewQueue: snapshot.reconciliation?.reviewQueue.length ?? 0,
    gaps: snapshot.reconciliation?.gaps ?? [],
    sources: snapshot.reconciliation?.sources ?? [],
    coverage: GOAL_PROFILES.map((profile) => {
      const result = computeCoverage(snapshot.index.skills, profile.id)
      return {
        profile: result.profile,
        coverage: result.coverage,
        gaps: result.gaps.map((gap) => ({ category: gap.category, supply: gap.supply, min: gap.min, top: uninstalledTop(gap.top, snapshot.lock) })),
      }
    }),
  }
}

export function buildSkills(snapshot: UiSnapshot, query: SkillsQuery): SkillsPageDto {
  return filterSkills(
    snapshot.index.skills.map((record) => toCard(record, snapshot.lock)),
    query,
  )
}

export function buildDetail(snapshot: UiSnapshot, id: string): SkillDetail | undefined {
  const record = snapshot.index.skills.find((skill) => skill.id === id)
  return record ? toDetail(record, snapshot.lock) : undefined
}

export function buildReview(snapshot: UiSnapshot): ReviewDto {
  const cards = snapshot.index.skills.map((record) => toCard(record, snapshot.lock))
  const byId = new Map(snapshot.index.skills.map((record) => [record.id, record]))
  const updates = Object.values(snapshot.lock.skills)
    .flatMap((entry) => {
      const record = byId.get(entry.id)
      if (!record || record.status !== "candidate" || entry.contentHash === record.contentHash) return []
      return [{ id: entry.id, from: entry.total, to: record.scores.total, riskFrom: entry.riskLevel, riskTo: record.risk.level }]
    })
    .sort((a, b) => b.to - a.to || a.id.localeCompare(b.id))
  const queue = new Set(snapshot.reconciliation?.reviewQueue ?? [])
  const upgrades = computeUpgradeSuggestions(
    snapshot.index.skills,
    Object.entries(snapshot.lock.skills).map(([id, entry]) => ({ id, total: entry.total, active: entry.active })),
  ).map(({ from, to, fromTotal, toTotal }) => ({ from, to, fromTotal, toTotal }))
  return {
    newCandidates: cards
      .filter((card) => queue.has(card.id) && card.status === "candidate")
      .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id)),
    upgrades,
    updates,
    quarantined: cards.filter((card) => card.status === "quarantined").sort((a, b) => b.total - a.total || a.id.localeCompare(b.id)),
    gaps: snapshot.reconciliation?.gaps ?? [],
    sources: snapshot.reconciliation?.sources ?? [],
  }
}

export function buildClusters(snapshot: UiSnapshot): ClustersDto {
  if (!snapshot.clusters) return { generatedAt: snapshot.index.generatedAt, clusters: [] }
  const cards = new Map(snapshot.index.skills.map((record) => [record.id, toCard(record, snapshot.lock)]))
  const counts = new Map<string, number>()
  for (const record of snapshot.index.skills) counts.set(record.clusterId, (counts.get(record.clusterId) ?? 0) + 1)
  return {
    generatedAt: snapshot.clusters.generatedAt,
    clusters: snapshot.clusters.clusters.map((cluster) => ({
      id: cluster.id,
      label: cluster.label,
      category: cluster.category,
      count: counts.get(cluster.id) ?? 0,
      ...(cards.get(cluster.top) ? { top: cards.get(cluster.top)! } : {}),
      alternatives: cluster.alternatives.flatMap((id) => (cards.get(id) ? [cards.get(id)!] : [])),
    })),
  }
}

export function buildTrending(snapshot: UiSnapshot): TrendingDto {
  if (!snapshot.trending) return { generatedAt: snapshot.index.generatedAt, topVelocity: [], newThisMonth: [] }
  const cards = new Map(snapshot.index.skills.map((record) => [record.id, toCard(record, snapshot.lock)]))
  return {
    generatedAt: snapshot.trending.generatedAt,
    topVelocity: snapshot.trending.topVelocity.flatMap((entry) =>
      cards.get(entry.id) ? [{ card: cards.get(entry.id)!, stars: entry.stars, delta7d: entry.delta7d, delta30d: entry.delta30d }] : [],
    ),
    newThisMonth: snapshot.trending.newThisMonth.flatMap((entry) =>
      cards.get(entry.id) ? [{ card: cards.get(entry.id)!, stars: entry.stars, createdAt: entry.createdAt }] : [],
    ),
  }
}
