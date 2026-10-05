import { evalKey, type EvalCache, type EvalCacheEntry } from "./eval-cache.ts"
import { RUBRIC_VERSION, type RubricEvaluation } from "./rubric.ts"
import { rescoreWithQuality, type ScoreWeights } from "./score.ts"
import type { SkillRecord } from "./types.ts"

export type EvaluateInput = { id: string; name: string; description: string; body: string }
export type EvaluateFn = (input: EvaluateInput) => Promise<RubricEvaluation>

export type EvaluateStats = {
  evaluated: number
  failed: number
  cached: number
  skippedBudget: number
  skippedQuarantined: number
  skippedNoBody: number
  spentUsd: number
}

const applyEntry = (record: SkillRecord, entry: EvalCacheEntry, weights?: ScoreWeights): SkillRecord => {
  const flags = entry.flags.length > 0 ? ` flags: ${entry.flags.join(", ")}` : ""
  const reasons = [`quality: ${entry.rubricVersion} ${entry.score} — ${entry.reasoning.slice(0, 300)}${flags}`]
  return {
    ...record,
    scores: rescoreWithQuality({
      scores: record.scores,
      quality: entry.score,
      reasons,
      rubricVersion: entry.rubricVersion,
      evaluatedAt: entry.evaluatedAt,
      weights,
    }),
  }
}

const markBudgetSkip = (record: SkillRecord): SkillRecord => ({
  ...record,
  scores: { ...record.scores, reasons: [...record.scores.reasons, "quality: heuristic fallback (evaluation budget reached)"] },
})

/** Delta-only, budget-capped rubric evaluation. Only candidate-status records are evaluated. */
export async function evaluateRecords(
  records: SkillRecord[],
  opts: {
    cache: EvalCache
    evaluate: EvaluateFn
    bodies: Map<string, string>
    maxEvals?: number
    maxUsd?: number
    costPerEvalUsd?: number
    weights?: ScoreWeights
    now: Date
  },
): Promise<{ records: SkillRecord[]; cache: EvalCache; stats: EvaluateStats }> {
  const maxEvals = opts.maxEvals ?? Number.POSITIVE_INFINITY
  const maxUsd = opts.maxUsd ?? Number.POSITIVE_INFINITY
  const costPerEvalUsd = opts.costPerEvalUsd ?? 0.01
  const entries = { ...opts.cache.entries }
  const stats: EvaluateStats = { evaluated: 0, failed: 0, cached: 0, skippedBudget: 0, skippedQuarantined: 0, skippedNoBody: 0, spentUsd: 0 }
  const out: SkillRecord[] = []

  for (const record of records) {
    if (record.status !== "candidate") {
      stats.skippedQuarantined++
      out.push(record)
      continue
    }
    const key = evalKey(record.contentHash, RUBRIC_VERSION)
    const hit = entries[key]
    if (hit) {
      stats.cached++
      out.push(applyEntry(record, hit, opts.weights))
      continue
    }
    const body = opts.bodies.get(record.id)
    if (body === undefined) {
      stats.skippedNoBody++
      out.push(record)
      continue
    }
    if (stats.evaluated >= maxEvals || stats.spentUsd + costPerEvalUsd > maxUsd) {
      stats.skippedBudget++
      out.push(markBudgetSkip(record))
      continue
    }
    let evaluation: RubricEvaluation
    try {
      evaluation = await opts.evaluate({ id: record.id, name: record.name, description: record.description, body })
    } catch (error) {
      stats.failed++
      const message = error instanceof Error ? error.message : String(error)
      out.push({
        ...record,
        scores: { ...record.scores, reasons: [...record.scores.reasons, `quality: evaluation failed (${message.slice(0, 200)})`] },
      })
      continue
    }
    stats.evaluated++
    stats.spentUsd = Math.round((stats.spentUsd + evaluation.costUsd) * 1e6) / 1e6
    const entry: EvalCacheEntry = {
      contentHash: record.contentHash,
      rubricVersion: RUBRIC_VERSION,
      score: evaluation.result.score,
      dimensions: evaluation.result.dimensions,
      reasoning: evaluation.result.reasoning,
      flags: evaluation.result.flags,
      model: evaluation.model,
      costUsd: evaluation.costUsd,
      evaluatedAt: opts.now.toISOString(),
    }
    entries[key] = entry
    out.push(applyEntry(record, entry, opts.weights))
  }

  return { records: out, cache: { version: 1, entries }, stats }
}
