import { deriveDescription, parseSkillMd, sha256, normalizeText, slugId, SkillParseError } from "./parse.ts"
import { runGates } from "./gates.ts"
import { scanSkill } from "./scan.ts"
import { scoreRecord } from "./score.ts"
import { assignCluster } from "./cluster.ts"
import { SignalsSchema, type FileEntry, type SkillRecord } from "./types.ts"
import type { Candidate } from "./sources/types.ts"

export type NormalizeResult = { record?: SkillRecord; rejected?: { reason: string } }

export function normalizeCandidate(candidate: Candidate, opts: { now: Date; maxIdleMonths?: number }): NormalizeResult {
  const skillFile = candidate.files.find((f) => f.path.endsWith("SKILL.md") && f.content !== undefined)
  if (!skillFile?.content) {
    return { rejected: { reason: `no SKILL.md content for candidate "${candidate.name}"` } }
  }

  let parsed
  try {
    parsed = parseSkillMd(skillFile.content)
  } catch (e) {
    return { rejected: { reason: e instanceof SkillParseError ? e.message : String(e) } }
  }

  if (!parsed.description) {
    const derived = deriveDescription(parsed.body)
    if (derived) parsed = { ...parsed, description: derived }
  }

  const files: FileEntry[] = candidate.files
    .filter((f) => f.content !== undefined)
    .map((f) => ({ path: f.path, sha256: sha256(f.content as string), size: Buffer.byteLength(f.content as string) }))

  const missing = candidate.files.some((f) => f.content === undefined)
  const signals = SignalsSchema.parse(candidate.signals)
  const risk = scanSkill(parsed.body)

  const gates = runGates({
    parsed,
    signals,
    source: candidate.source,
    filesPresent: candidate.files.map((f) => f.content !== undefined),
    risk,
    now: opts.now,
    maxIdleMonths: opts.maxIdleMonths,
  })

  const failed = gates.filter((g) => !g.passed)
  const critical = failed.some((g) => g.gate === "scan")
  if (failed.length > 0 && !critical) {
    return { rejected: { reason: failed.map((g) => `${g.gate}: ${g.reason}`).join("; ") } }
  }
  if (missing) {
    return { rejected: { reason: "candidate has files without fetched content (cannot hash)" } }
  }

  const scores = scoreRecord({ parsed, risk, signals, filesPresent: [true], source: candidate.source, now: opts.now })
  const cluster = assignCluster({ category: candidate.categoryHint ?? "engineering", tags: candidate.tags })

  const record: SkillRecord = {
    id: slugId(candidate.source.repo, candidate.name),
    name: parsed.name,
    description: parsed.description ?? "",
    category: candidate.categoryHint ?? "engineering",
    tags: candidate.tags,
    clusterId: cluster.clusterId,
    clusterLabel: cluster.clusterLabel,
    source: candidate.source,
    files,
    contentHash: sha256(normalizeText(parsed.raw)),
    requires: { runtime: [], scripts: [], mcp: [], env: [], services: [] },
    risk,
    signals,
    scores,
    provenanceTier: candidate.source.kind === "github" ? "sha-pinned" : candidate.source.kind === "marketplace" ? "content-hash-pinned" : "local",
    status: critical ? "quarantined" : "candidate",
    relations: { supersedes: [], duplicates: [], alternatives: [] },
  }
  return { record }
}
