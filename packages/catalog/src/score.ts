import type { ParsedSkill } from "./parse.ts"
import type { Risk, Scores, Signals, Source } from "./types.ts"

export type ScoreWeights = { quality: number; trust: number; freshness: number; compatibility: number; adoption: number }
export const DEFAULT_WEIGHTS: ScoreWeights = { quality: 0.35, trust: 0.25, freshness: 0.15, compatibility: 0.15, adoption: 0.1 }

export type ScoreInput = {
  parsed: ParsedSkill
  risk: Risk
  signals: Signals
  filesPresent: boolean[]
  source: Source
  now: Date
  weights?: ScoreWeights
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n))

export function qualityHeuristic(parsed: ParsedSkill): { value: number; reasons: string[] } {
  const reasons: string[] = []
  let value = 0
  const description = parsed.description ?? ""

  if (description.length >= 40) {
    value += 20
    reasons.push("quality: description present (+20)")
  }
  if (/use (when|for|only)/i.test(description)) {
    value += 10
    reasons.push("quality: description states when to use (+10)")
  }
  const headings = (parsed.body.match(/^#{2,3}\s/gm) ?? []).length
  if (headings >= 3) {
    value += 15
    reasons.push("quality: three or more sections (+15)")
  }
  if (/^\s*(\d+\.|[-*])\s/m.test(parsed.body)) {
    value += 10
    reasons.push("quality: workflow/steps present (+10)")
  }
  if (/```/.test(parsed.body)) {
    value += 10
    reasons.push("quality: code example present (+10)")
  }
  const length = parsed.body.length
  if (length >= 800 && length <= 8000) {
    value += 15
    reasons.push("quality: substantial body (+15)")
  }
  if (/(##\s*(examples?|usage))/i.test(parsed.body)) {
    value += 10
    reasons.push("quality: examples/usage section (+10)")
  }
  return { value: clamp(value), reasons }
}

export function scoreRecord(input: ScoreInput): Scores {
  const { parsed, risk, signals, filesPresent, source, now } = input
  const weights = input.weights ?? DEFAULT_WEIGHTS
  const reasons: string[] = []

  const quality = qualityHeuristic(parsed)
  reasons.push(...quality.reasons)

  let trust = 80
  if (source.license) {
    trust += 10
    reasons.push("trust: license known (+10)")
  }
  for (const finding of risk.findings) {
    const penalty = finding.severity === "critical" ? 40 : finding.severity === "high" ? 20 : 5
    trust -= penalty
    reasons.push(`trust: ${finding.rule} (-${penalty})`)
  }

  let freshness = 100
  if (source.kind !== "local") {
    if (signals.pushedAt) {
      const days = Math.max(0, (now.getTime() - Date.parse(signals.pushedAt)) / 86_400_000)
      freshness = clamp(Math.round(100 * Math.exp(-days / 365)))
      reasons.push(`freshness: pushed ${Math.round(days)} days ago (${freshness})`)
    } else {
      freshness = 10
      reasons.push("freshness: no push date (10)")
    }
  } else {
    reasons.push("freshness: local skill (100)")
  }

  const missing = filesPresent.filter((p) => !p).length
  const compatibility = clamp(100 - missing * 25)
  reasons.push(missing ? `compatibility: ${missing} missing file(s) (-${missing * 25})` : "compatibility: all files present (100)")

  const adoption = clamp(Math.log10(1 + signals.stars) * 10 + Math.log10(1 + signals.installs) * 8)
  reasons.push(`adoption: ${signals.stars} stars / ${signals.installs} installs (${Math.round(adoption)})`)

  const parts = {
    quality: quality.value,
    trust: clamp(trust),
    freshness,
    compatibility,
    adoption: Math.round(adoption),
  }
  const total =
    Math.round(
      (parts.quality * weights.quality +
        parts.trust * weights.trust +
        parts.freshness * weights.freshness +
        parts.compatibility * weights.compatibility +
        parts.adoption * weights.adoption) *
        100,
    ) / 100

  return { total, ...parts, reasons, rubricVersion: "heuristic-v0", evaluatedAt: now.toISOString() }
}
