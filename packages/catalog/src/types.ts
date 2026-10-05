import { z } from "zod"

export const RiskFindingSchema = z.object({
  rule: z.string(),
  category: z.enum(["injection", "exfiltration", "shell", "obfuscation", "filesystem"]),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  match: z.string(),
  line: z.number(),
})
export type RiskFinding = z.infer<typeof RiskFindingSchema>

export const RiskSchema = z.object({
  level: z.enum(["low", "medium", "high", "critical"]),
  findings: z.array(RiskFindingSchema),
})
export type Risk = z.infer<typeof RiskSchema>

export const SourceSchema = z.object({
  kind: z.enum(["github", "marketplace", "local"]),
  repo: z.string().optional(),
  path: z.string(),
  ref: z.string().optional(),
  url: z.string().optional(),
  license: z.string().optional(),
  licenseFlags: z.array(z.string()).default([]),
})
export type Source = z.infer<typeof SourceSchema>

export const FileEntrySchema = z.object({ path: z.string(), sha256: z.string(), size: z.number() })
export type FileEntry = z.infer<typeof FileEntrySchema>

export const SignalsSchema = z.object({
  stars: z.number().default(0),
  starVelocity30d: z.number().default(0),
  forks: z.number().default(0),
  installs: z.number().default(0),
  views: z.number().default(0),
  pushedAt: z.string().nullable().default(null),
  createdAt: z.string().nullable().default(null),
  archived: z.boolean().default(false),
})
export type Signals = z.infer<typeof SignalsSchema>

export const ScoresSchema = z.object({
  total: z.number(),
  quality: z.number(),
  trust: z.number(),
  freshness: z.number(),
  compatibility: z.number(),
  adoption: z.number(),
  reasons: z.array(z.string()),
  rubricVersion: z.string(),
  evaluatedAt: z.string(),
})
export type Scores = z.infer<typeof ScoresSchema>

export const RequiresSchema = z.object({
  runtime: z.array(z.string()),
  scripts: z.array(z.string()),
  mcp: z.array(z.string()),
  env: z.array(z.string()),
  services: z.array(z.string()),
})
export type Requires = z.infer<typeof RequiresSchema>

export const SkillRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  summaryDerived: z.string().optional(),
  category: z.string(),
  tags: z.array(z.string()),
  clusterId: z.string(),
  clusterLabel: z.string(),
  source: SourceSchema,
  files: z.array(FileEntrySchema),
  contentHash: z.string(),
  requires: RequiresSchema,
  risk: RiskSchema,
  signals: SignalsSchema,
  scores: ScoresSchema,
  provenanceTier: z.enum(["sha-pinned", "content-hash-pinned", "local"]),
  status: z.enum(["candidate", "active", "quarantined", "blocked"]).default("candidate"),
  relations: z
    .object({
      supersedes: z.array(z.string()),
      duplicates: z.array(z.string()),
      alternatives: z.array(z.string()),
    })
    .default({ supersedes: [], duplicates: [], alternatives: [] }),
})
export type SkillRecord = z.infer<typeof SkillRecordSchema>
