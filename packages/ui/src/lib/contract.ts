export type Risk = "low" | "medium" | "high" | "critical"
export type Status = "candidate" | "active" | "quarantined" | "blocked"
export type Provenance = "sha-pinned" | "content-hash-pinned" | "local"
export type SourceKind = "github" | "marketplace" | "local"

export type ScoresLike = {
  total: number
  quality: number
  trust: number
  freshness: number
  compatibility: number
  adoption: number
  reasons: string[]
  rubricVersion: string
  evaluatedAt: string
}

export type RequiresLike = { runtime: string[]; scripts: string[]; mcp: string[]; env: string[]; services: string[] }
export type RelationsLike = { supersedes: string[]; duplicates: string[]; alternatives: string[] }
export type SourceLike = { kind: SourceKind; repo?: string; path: string; ref?: string; url?: string; license?: string; licenseFlags: string[] }
export type SignalsLike = {
  stars: number
  starVelocity30d: number
  forks: number
  installs: number
  views: number
  pushedAt: string | null
  createdAt: string | null
  archived: boolean
}

export type SkillCard = {
  id: string
  name: string
  description: string
  category: string
  labels: string[]
  tags: string[]
  clusterId: string
  clusterLabel: string
  total: number
  freshness: number
  risk: Risk
  provenance: Provenance
  status: Status
  sourceKind: SourceKind
  sourceRepo?: string
  installed: boolean
  active: boolean
  updateAvailable: boolean
}

export type SkillDetail = SkillCard & {
  scores: ScoresLike
  riskFindings: { rule: string; severity: string; line: number; match: string }[]
  requires: RequiresLike
  files: { path: string; size: number }[]
  relations: RelationsLike
  source: SourceLike
  signals: SignalsLike
  summaryDerived?: string
}

export type SourceStatDto = { source: string; candidates: number; fetchedAt: string; error?: string; warnings?: string[] }

export type CoverageGapDto = { category: string; supply: number; min: number; top: { id: string; name: string; total: number }[] }
export type ProfileCoverageDto = { profile: string; coverage: number; gaps: CoverageGapDto[] }

export type StatusDto = {
  generatedAt: string
  counts: { total: number; byStatus: Record<string, number>; byCategory: Record<string, number> }
  installed: number
  active: number
  updates: number
  reviewQueue: number
  gaps: string[]
  sources: SourceStatDto[]
  coverage: ProfileCoverageDto[]
}

export type ReviewUpdateDto = { id: string; from: number; to: number; riskFrom: string; riskTo: string }
export type ReviewUpgradeDto = { from: string; to: string; fromTotal: number; toTotal: number }
export type ReviewDto = {
  newCandidates: SkillCard[]
  upgrades: ReviewUpgradeDto[]
  updates: ReviewUpdateDto[]
  quarantined: SkillCard[]
  gaps: string[]
  sources: SourceStatDto[]
}

export type ClusterDto = { id: string; label: string; category: string; count: number; top?: SkillCard; alternatives: SkillCard[] }
export type ClustersDto = { generatedAt: string; clusters: ClusterDto[] }

export type TrendingDto = {
  generatedAt: string
  topVelocity: { card: SkillCard; stars: number; delta7d: number; delta30d: number }[]
  newThisMonth: { card: SkillCard; stars: number; createdAt: string }[]
}

export type SkillsQuery = {
  q?: string
  category?: string
  status?: string
  risk?: string
  provenance?: string
  cluster?: string
  sort?: "score" | "freshness" | "name"
  page?: number
  pageSize?: number
}

export type SkillsPageDto = { total: number; page: number; pageSize: number; items: SkillCard[] }

export type InstallResultDto = { status: "verified" | "installed"; entry: { id: string; contentHash: string; provenanceTier: string; riskLevel: string; total: number } }

export type InstallBestPickDto = {
  category: string
  id: string
  name: string
  total: number
  risk: string
  outcome: "planned" | "installed" | "activated" | "failed"
  error?: string
}
export type InstallBestResultDto = {
  perCategory: number
  picks: InstallBestPickDto[]
  covered: string[]
  failed: number
}

export type UpdateReviewDto = {
  kind: "update" | "up-to-date" | "not-installed" | "blocked"
  changes?: { path: string; status: string; patch?: string }[]
  riskDelta?: { from: string; to: string }
  scoreDelta?: { from: number; to: number }
  blockedFindings?: string[]
}

export { filterSkills } from "./filter.ts"
