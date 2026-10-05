import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { calibrateWeights, GoldenSetSchema, writeCalibration, type CalibrationResult } from "../../../catalog/src/calibrate.ts"
import { labelTemplateTsv, parseLabelTsv, sampleForLabeling } from "../../../catalog/src/label.ts"
import type { TrendingFile } from "../../../catalog/src/trending.ts"
import type { StoreLayout } from "../paths.ts"
import { readCatalog } from "./read.ts"

export function runCalibrate(l: StoreLayout, goldenPath: string): CalibrationResult & { goldenSize: number } {
  const index = readCatalog(l)
  const golden = GoldenSetSchema.parse(JSON.parse(readFileSync(goldenPath, "utf8")))
  const result = calibrateWeights(index.skills, golden)
  return { ...result, goldenSize: golden.labels.length }
}

export function applyCalibration(l: StoreLayout, result: CalibrationResult & { goldenSize: number }, now: Date = new Date()): string {
  const path = join(l.catalogDir, "calibration.json")
  writeCalibration(path, {
    version: 1,
    generatedAt: now.toISOString(),
    weights: result.weights,
    agreement: result.agreement,
    baselineAgreement: result.baselineAgreement,
    goldenSize: result.goldenSize,
  })
  return path
}

export function runLabelExport(l: StoreLayout, outPath: string, limit: number): number {
  const sample = sampleForLabeling(readCatalog(l).skills, limit)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, labelTemplateTsv(sample))
  return sample.length
}

export function runLabelImport(tsvPath: string, outPath: string): number {
  const golden = parseLabelTsv(readFileSync(tsvPath, "utf8"))
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(golden, null, 2) + "\n")
  return golden.labels.length
}

export function readTrending(l: StoreLayout): TrendingFile | undefined {
  const path = join(l.catalogDir, "trending.json")
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, "utf8")) as TrendingFile
}

export function formatTrending(file: TrendingFile): string {
  const lines = [`SkillHub trending — ${file.generatedAt}`]
  if (file.topVelocity.length === 0) lines.push("  (no velocity data yet — trends build from daily snapshots)")
  for (const entry of file.topVelocity) {
    lines.push(`  ${entry.repo} [${entry.stars}] +${entry.delta7d}/7d +${entry.delta30d}/30d — ${entry.id}`)
  }
  if (file.newThisMonth.length > 0) {
    lines.push("  new this month:")
    for (const entry of file.newThisMonth) lines.push(`    ${entry.id} (${entry.repo}, ${entry.stars} stars)`)
  }
  return lines.join("\n")
}
