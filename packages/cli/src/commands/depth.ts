import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { calibrateWeights, GoldenSetSchema, writeCalibration, type CalibrationResult } from "../../../catalog/src/calibrate.ts"
import { labelTemplateTsv, parseLabelTsv, sampleForLabeling } from "../../../catalog/src/label.ts"
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
