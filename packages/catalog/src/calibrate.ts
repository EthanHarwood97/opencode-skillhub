import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { z } from "zod"
import { DEFAULT_WEIGHTS, type ScoreWeights } from "./score.ts"
import type { Scores, SkillRecord } from "./types.ts"

export const GoldenSetSchema = z.object({
  version: z.literal(1),
  labels: z.array(
    z.object({
      id: z.string(),
      tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      notes: z.string().optional(),
    }),
  ),
})
export type GoldenSet = z.infer<typeof GoldenSetSchema>

export type CalibrationFile = {
  version: 1
  generatedAt: string
  weights: ScoreWeights
  agreement: number
  baselineAgreement: number
  goldenSize: number
}

const WEIGHT_KEYS = ["quality", "trust", "freshness", "compatibility", "adoption"] as const

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i)
  const out = new Array<number>(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k]!.i] = avg
    i = j + 1
  }
  return out
}

export function spearman(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0
  const ra = ranks(a)
  const rb = ranks(b)
  const n = a.length
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / n
  const ma = mean(ra)
  const mb = mean(rb)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = ra[i]! - ma
    const y = rb[i]! - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db)
}

export function composeTotal(scores: Scores, weights: ScoreWeights): number {
  return (
    Math.round(
      (scores.quality * weights.quality +
        scores.trust * weights.trust +
        scores.freshness * weights.freshness +
        scores.compatibility * weights.compatibility +
        scores.adoption * weights.adoption) *
        100,
    ) / 100
  )
}

export function rankAgreement(records: SkillRecord[], golden: GoldenSet, weights: ScoreWeights = DEFAULT_WEIGHTS): number {
  const byId = new Map(records.map((r) => [r.id, r]))
  const labelled = golden.labels
    .map((label) => ({ record: byId.get(label.id), tier: label.tier }))
    .filter((x): x is { record: SkillRecord; tier: 1 | 2 | 3 | 4 } => x.record !== undefined)
  if (labelled.length < 2) return 0
  return spearman(
    labelled.map((l) => composeTotal(l.record.scores, weights)),
    labelled.map((l) => -l.tier),
  )
}

const distanceFromDefault = (w: ScoreWeights): number => WEIGHT_KEYS.reduce((s, k) => s + Math.abs(w[k] - DEFAULT_WEIGHTS[k]), 0)

export type CalibrationResult = { weights: ScoreWeights; agreement: number; baselineAgreement: number; gridSize: number }

export function calibrateWeights(records: SkillRecord[], golden: GoldenSet, opts: { step?: number } = {}): CalibrationResult {
  const step = opts.step ?? 0.05
  const n = Math.max(1, Math.round(1 / step))
  const baselineAgreement = rankAgreement(records, golden)
  let best: { weights: ScoreWeights; agreement: number } | undefined
  let gridSize = 0
  for (let q = 0; q <= n; q++) {
    for (let t = 0; q + t <= n; t++) {
      for (let f = 0; q + t + f <= n; f++) {
        for (let c = 0; q + t + f + c <= n; c++) {
          const a = n - (q + t + f + c)
          gridSize++
          const weights: ScoreWeights = { quality: q / n, trust: t / n, freshness: f / n, compatibility: c / n, adoption: a / n }
          const agreement = rankAgreement(records, golden, weights)
          if (
            !best ||
            agreement > best.agreement + 1e-9 ||
            (Math.abs(agreement - best.agreement) <= 1e-9 && distanceFromDefault(weights) < distanceFromDefault(best.weights) - 1e-9)
          ) {
            best = { weights, agreement }
          }
        }
      }
    }
  }
  return { weights: best?.weights ?? DEFAULT_WEIGHTS, agreement: best?.agreement ?? baselineAgreement, baselineAgreement, gridSize }
}

export function writeCalibration(path: string, file: CalibrationFile): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n")
}

export function readCalibration(path: string): ScoreWeights | undefined {
  if (!existsSync(path)) return undefined
  const file = JSON.parse(readFileSync(path, "utf8")) as CalibrationFile
  return file.weights
}
