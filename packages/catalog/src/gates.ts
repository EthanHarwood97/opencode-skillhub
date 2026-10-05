import type { ParsedSkill } from "./parse.ts"
import type { Risk, Signals, Source } from "./types.ts"

export type GateResult = { gate: string; passed: boolean; reason: string }
export type GateInput = {
  parsed?: ParsedSkill
  signals: Signals
  source: Source
  filesPresent: boolean[]
  risk?: Risk
  now: Date
  maxIdleMonths?: number
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

export function runGates(input: GateInput): GateResult[] {
  const { parsed, signals, source, filesPresent, risk, now } = input
  const maxIdleMonths = input.maxIdleMonths ?? 18
  const results: GateResult[] = []

  results.push(
    parsed && parsed.name
      ? { gate: "frontmatter", passed: true, reason: `name "${parsed.name}" present` }
      : { gate: "frontmatter", passed: false, reason: "missing or unparseable frontmatter" },
  )

  if (signals.archived) {
    results.push({ gate: "maintenance", passed: false, reason: "repository archived" })
  } else if (source.kind === "local") {
    results.push({ gate: "maintenance", passed: true, reason: "local skill exempt from maintenance clock" })
  } else if (signals.pushedAt) {
    const ageMonths = (now.getTime() - Date.parse(signals.pushedAt)) / MONTH_MS
    results.push(
      ageMonths <= maxIdleMonths
        ? { gate: "maintenance", passed: true, reason: `last push ${ageMonths.toFixed(1)} months ago` }
        : { gate: "maintenance", passed: false, reason: `idle ${ageMonths.toFixed(1)} months > ${maxIdleMonths}` },
    )
  } else if (source.kind === "marketplace") {
    results.push({ gate: "maintenance", passed: true, reason: "marketplace entry has no repository to age" })
  } else {
    results.push({ gate: "maintenance", passed: false, reason: "no push timestamp available" })
  }

  results.push(
    source.license || source.licenseFlags.includes("unknown-license")
      ? { gate: "license", passed: true, reason: source.license ? `license ${source.license}` : "license explicitly unknown" }
      : { gate: "license", passed: false, reason: "license unknown and not flagged" },
  )

  const missing = filesPresent.filter((present) => !present).length
  results.push(
    missing === 0
      ? { gate: "files", passed: true, reason: "all referenced files present" }
      : { gate: "files", passed: false, reason: `${missing} referenced file(s) missing` },
  )

  results.push(
    risk && risk.level === "critical"
      ? { gate: "scan", passed: false, reason: "critical static-scan finding" }
      : { gate: "scan", passed: true, reason: risk ? `risk ${risk.level}` : "no scan findings" },
  )

  return results
}
