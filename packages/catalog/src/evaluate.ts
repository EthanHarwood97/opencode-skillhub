import { evalKey, type EvalCache, type EvalCacheEntry } from "./eval-cache.ts"
import { RUBRIC_VERSION, type RubricEvaluation } from "./rubric.ts"
import { rescoreWithQuality, type ScoreWeights } from "./score.ts"
import { mapLimit } from "./sources/util.ts"
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

/** Delta-only, budget-capped rubric evaluation. Only candidate-status records are evaluated. Output order matches input order. */
export async function evaluateRecords(
  records: SkillRecord[],
  opts: {
    cache: EvalCache
    evaluate: EvaluateFn
    bodies: Map<string, string>
    maxEvals?: number
    maxUsd?: number
    costPerEvalUsd?: number
    concurrency?: number
    weights?: ScoreWeights
    now: Date
  },
): Promise<{ records: SkillRecord[]; cache: EvalCache; stats: EvaluateStats }> {
  const maxEvals = opts.maxEvals ?? Number.POSITIVE_INFINITY
  const maxUsd = opts.maxUsd ?? Number.POSITIVE_INFINITY
  const costPerEvalUsd = opts.costPerEvalUsd ?? 0.01
  const concurrency = Math.max(1, opts.concurrency ?? 4)
  const entries = { ...opts.cache.entries }
  const stats: EvaluateStats = { evaluated: 0, failed: 0, cached: 0, skippedBudget: 0, skippedQuarantined: 0, skippedNoBody: 0, spentUsd: 0 }

  type Plan = { kind: "record"; record: SkillRecord } | { kind: "pending"; record: SkillRecord; body: string }
  const plan: Plan[] = []

  for (const record of records) {
    if (record.status !== "candidate") {
      stats.skippedQuarantined++
      plan.push({ kind: "record", record })
      continue
    }
    const key = evalKey(record.contentHash, RUBRIC_VERSION)
    const hit = entries[key]
    if (hit) {
      stats.cached++
      plan.push({ kind: "record", record: applyEntry(record, hit, opts.weights) })
      continue
    }
    const body = opts.bodies.get(record.id)
    if (body === undefined) {
      stats.skippedNoBody++
      plan.push({ kind: "record", record })
      continue
    }
    plan.push({ kind: "pending", record, body })
  }

  const pendingIndexes = plan.map((entry, index) => (entry.kind === "pending" ? index : -1)).filter((index) => index >= 0)
  const budgetSlots = Number.isFinite(maxUsd) ? Math.max(0, Math.floor((maxUsd - stats.spentUsd) / costPerEvalUsd + 1e-9)) : Number.POSITIVE_INFINITY
  const evalSlots = Number.isFinite(maxEvals) ? Math.max(0, maxEvals - stats.evaluated) : Number.POSITIVE_INFINITY
  const runnableCount = Math.min(budgetSlots, evalSlots, pendingIndexes.length)
  const runIndexes = pendingIndexes.slice(0, runnableCount)
  const skipIndexes = pendingIndexes.slice(runnableCount)

  for (const index of skipIndexes) {
    stats.skippedBudget++
    const pending = plan[index] as { kind: "pending"; record: SkillRecord }
    plan[index] = { kind: "record", record: markBudgetSkip(pending.record) }
  }

  const results = await mapLimit(runIndexes, concurrency, async (index) => {
    const pending = plan[index] as { kind: "pending"; record: SkillRecord; body: string }
    try {
      const evaluation = await opts.evaluate({ id: pending.record.id, name: pending.record.name, description: pending.record.description, body: pending.body })
      return { index, evaluation, error: undefined }
    } catch (error) {
      return { index, evaluation: undefined, error }
    }
  })

  for (const result of results) {
    const pending = plan[result.index] as { kind: "pending"; record: SkillRecord; body: string }
    if (result.error !== undefined || result.evaluation === undefined) {
      stats.failed++
      const message = result.error instanceof Error ? result.error.message : String(result.error)
      plan[result.index] = {
        kind: "record",
        record: {
          ...pending.record,
          scores: { ...pending.record.scores, reasons: [...pending.record.scores.reasons, `quality: evaluation failed (${message.slice(0, 200)})`] },
        },
      }
      continue
    }
    stats.evaluated++
    stats.spentUsd = Math.round((stats.spentUsd + result.evaluation.costUsd) * 1e6) / 1e6
    const entry: EvalCacheEntry = {
      contentHash: pending.record.contentHash,
      rubricVersion: RUBRIC_VERSION,
      score: result.evaluation.result.score,
      dimensions: result.evaluation.result.dimensions,
      reasoning: result.evaluation.result.reasoning,
      flags: result.evaluation.result.flags,
      model: result.evaluation.model,
      costUsd: result.evaluation.costUsd,
      evaluatedAt: opts.now.toISOString(),
    }
    entries[evalKey(pending.record.contentHash, RUBRIC_VERSION)] = entry
    plan[result.index] = { kind: "record", record: applyEntry(pending.record, entry, opts.weights) }
  }

  return { records: plan.map((entry) => entry.record), cache: { version: 1, entries }, stats }
}
