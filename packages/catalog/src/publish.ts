import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { buildClusters } from "./cluster.ts"
import type { ClustersFile } from "./cluster-types.ts"
import type { ReconciliationFile } from "./reconcile.ts"
import type { TrendingFile } from "./trending.ts"
import type { SkillRecord } from "./types.ts"

export type CatalogIndex = {
  version: 1
  generatedAt: string
  counts: { total: number; byStatus: Record<string, number>; byCategory: Record<string, number> }
  skills: SkillRecord[]
}

export function writeCatalog(
  records: SkillRecord[],
  outDir: string,
  now: Date,
  extras?: { trending?: TrendingFile; reconciliation?: ReconciliationFile },
): { index: CatalogIndex; clusters: ClustersFile } {
  mkdirSync(outDir, { recursive: true })
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id))

  const byStatus: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  for (const record of sorted) {
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1
    byCategory[record.category] = (byCategory[record.category] ?? 0) + 1
  }
  const index: CatalogIndex = {
    version: 1,
    generatedAt: now.toISOString(),
    counts: { total: sorted.length, byStatus, byCategory },
    skills: sorted,
  }
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n")

  const clusters = buildClusters(sorted, now)
  writeFileSync(join(outDir, "clusters.json"), JSON.stringify(clusters, null, 2) + "\n")

  if (extras?.trending) writeFileSync(join(outDir, "trending.json"), JSON.stringify(extras.trending, null, 2) + "\n")
  if (extras?.reconciliation) writeFileSync(join(outDir, "reconciliation.json"), JSON.stringify(extras.reconciliation, null, 2) + "\n")

  buildSearchDb(sorted, join(outDir, "search.db"))
  return { index, clusters }
}

export function buildSearchDb(records: SkillRecord[], dbPath: string): void {
  rmSync(dbPath, { force: true })
  const db = new DatabaseSync(dbPath)
  db.exec(
    "CREATE TABLE skills (id TEXT PRIMARY KEY, name TEXT, description TEXT, category TEXT, total REAL, risk TEXT, provenance TEXT, status TEXT, cluster TEXT, requires TEXT)",
  )
  db.exec("CREATE VIRTUAL TABLE skills_fts USING fts5(id UNINDEXED, name, description, tags)")
  const insert = db.prepare("INSERT INTO skills VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
  const insertFts = db.prepare("INSERT INTO skills_fts (id, name, description, tags) VALUES (?, ?, ?, ?)")
  for (const record of records) {
    insert.run(
      record.id, record.name, record.description, record.category, record.scores.total, record.risk.level,
      record.provenanceTier, record.status, record.clusterId, JSON.stringify(record.requires),
    )
    insertFts.run(record.id, record.name, record.description, record.tags.join(" "))
  }
  db.close()
}
