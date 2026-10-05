import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { SkillRecord } from "./types.ts"

export type StarSnapshot = { version: 1; date: string; repos: Record<string, number> }
export type TrendingEntry = { id: string; repo: string; stars: number; delta7d: number; delta30d: number }
export type TrendingFile = {
  version: 1
  generatedAt: string
  topVelocity: TrendingEntry[]
  newThisMonth: { id: string; repo: string; createdAt: string; stars: number }[]
}

const DAY_MS = 86_400_000

export function snapshotFromRecords(records: SkillRecord[], now: Date): StarSnapshot {
  const repos = new Map<string, number>()
  for (const record of records) {
    if (record.source.kind === "local" || !record.source.repo) continue
    repos.set(record.source.repo, Math.max(repos.get(record.source.repo) ?? 0, record.signals.stars))
  }
  return { version: 1, date: now.toISOString(), repos: Object.fromEntries([...repos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) }
}

export function selectBaseline(snapshots: StarSnapshot[], now: Date, days: number): StarSnapshot | undefined {
  const cutoff = now.getTime() - days * DAY_MS
  const eligible = snapshots.filter((snapshot) => Date.parse(snapshot.date) <= cutoff)
  if (eligible.length === 0) return undefined
  return eligible.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0]
}

export function computeTrending(records: SkillRecord[], opts: { snapshots: StarSnapshot[]; now: Date; limit?: number }): TrendingFile {
  const current = snapshotFromRecords(records, opts.now)
  const baseline7 = selectBaseline(opts.snapshots, opts.now, 7)
  const baseline30 = selectBaseline(opts.snapshots, opts.now, 30)

  const bestByRepo = new Map<string, SkillRecord>()
  for (const record of records) {
    if (record.source.kind === "local" || !record.source.repo || record.status !== "candidate") continue
    const existing = bestByRepo.get(record.source.repo)
    if (!existing || record.scores.total > existing.scores.total) bestByRepo.set(record.source.repo, record)
  }

  const topVelocity: TrendingEntry[] = [...bestByRepo.entries()]
    .map(([repo, record]) => {
      const stars = current.repos[repo] ?? record.signals.stars
      return {
        id: record.id,
        repo,
        stars,
        delta7d: Math.max(0, stars - (baseline7?.repos[repo] ?? stars)),
        delta30d: Math.max(0, stars - (baseline30?.repos[repo] ?? stars)),
      }
    })
    .filter((entry) => entry.delta7d > 0 || entry.delta30d > 0)
    .sort((a, b) => b.delta7d - a.delta7d || b.delta30d - a.delta30d || b.stars - a.stars || a.repo.localeCompare(b.repo))
    .slice(0, opts.limit ?? 20)

  const newThisMonth = records
    .filter((record) => {
      if (record.status !== "candidate" || record.source.kind === "local" || !record.source.repo) return false
      const created = record.signals.createdAt ? Date.parse(record.signals.createdAt) : Number.NaN
      return Number.isFinite(created) && opts.now.getTime() - created <= 30 * DAY_MS
    })
    .map((record) => ({ id: record.id, repo: record.source.repo!, createdAt: record.signals.createdAt!, stars: record.signals.stars }))
    .sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id))
    .slice(0, 10)

  return { version: 1, generatedAt: opts.now.toISOString(), topVelocity, newThisMonth }
}

export function writeSnapshot(dir: string, snapshot: StarSnapshot): string {
  const snapshotsDir = join(dir, "snapshots")
  const path = join(snapshotsDir, `${snapshot.date.slice(0, 10)}.json`)
  mkdirSync(snapshotsDir, { recursive: true })
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n")
  return path
}

export function readSnapshots(dir: string): StarSnapshot[] {
  const snapshotsDir = join(dir, "snapshots")
  if (!existsSync(snapshotsDir)) return []
  return readdirSync(snapshotsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(snapshotsDir, name), "utf8")) as StarSnapshot)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}
