import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { StoreLayout } from "../paths.ts"
import { buildClusters, buildReview, buildStatus, buildTrending, loadSnapshot, toDetail } from "./data.ts"

export type ExportOptions = {
  l: StoreLayout
  outDir: string
  uiDist: string
  catalogDir?: string
  maxRecords?: number
  force?: boolean
  now?: () => Date
}

export type ExportResult = { outDir: string; skills: number; bytes: number; warnings: string[] }

const copyDir = (from: string, to: string): void => {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from)) {
    const source = join(from, entry)
    const target = join(to, entry)
    if (statSync(source).isDirectory()) copyDir(source, target)
    else writeFileSync(target, readFileSync(source))
  }
}

const dirSize = (dir: string): number =>
  readdirSync(dir).reduce((total, entry) => {
    const path = join(dir, entry)
    return total + (statSync(path).isDirectory() ? dirSize(path) : statSync(path).size)
  }, 0)

export function exportStaticSite(opts: ExportOptions): ExportResult {
  const maxRecords = opts.maxRecords ?? 5000
  if (typeof maxRecords !== "number" || !Number.isInteger(maxRecords) || maxRecords < 1) {
    throw new Error("--max-records must be a positive integer")
  }
  const warnings: string[] = []
  const snapshot = loadSnapshot(opts.l, opts.catalogDir)
  if ("error" in snapshot) throw new Error(snapshot.error)
  warnings.push(...snapshot.warnings)

  if (opts.force) rmSync(opts.outDir, { recursive: true, force: true })
  if (existsSync(opts.outDir) && readdirSync(opts.outDir).length > 0) {
    throw new Error(`export target ${opts.outDir} is not empty — pass --force to replace it`)
  }

  copyDir(opts.uiDist, opts.outDir)

  const records = snapshot.index.skills.slice(0, maxRecords)
  if (snapshot.index.skills.length > maxRecords) {
    warnings.push(`exported ${maxRecords} of ${snapshot.index.skills.length} records — raise --max-records or use the local server for the full catalog`)
  }

  const dataDir = join(opts.outDir, "data")
  mkdirSync(dataDir, { recursive: true })
  const writeJson = (name: string, value: unknown) => writeFileSync(join(dataDir, name), JSON.stringify(value) + "\n")
  writeJson("skills.json", records.map((record) => toDetail(record, snapshot.lock)))
  writeJson("status.json", buildStatus(snapshot))
  writeJson("clusters.json", buildClusters(snapshot))
  writeJson("trending.json", buildTrending(snapshot))
  writeJson("review.json", buildReview(snapshot))

  const indexPath = join(opts.outDir, "index.html")
  const html = readFileSync(indexPath, "utf8").replace("</head>", '<script>window.__SKILLHUB__={"mode":"static"}</script></head>')
  writeFileSync(indexPath, html)

  return { outDir: opts.outDir, skills: records.length, bytes: dirSize(opts.outDir), warnings }
}
