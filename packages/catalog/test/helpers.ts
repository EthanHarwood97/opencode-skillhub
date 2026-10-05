import { assignCluster } from "../src/cluster.ts"
import { SkillRecordSchema, type SkillRecord } from "../src/types.ts"

export function makeRecord(partial: Partial<SkillRecord> & { id: string }): SkillRecord {
  const category = partial.category ?? "engineering"
  const tags = partial.tags ?? ["fixture"]
  const cluster = assignCluster({ category, tags })
  return SkillRecordSchema.parse({
    name: partial.id.split("/").at(-1) ?? partial.id,
    description: "fixture record",
    category,
    tags,
    clusterId: cluster.clusterId,
    clusterLabel: cluster.clusterLabel,
    source: { kind: "local", path: "SKILL.md", license: "MIT" },
    files: [],
    contentHash: "0".repeat(64),
    requires: { runtime: [], scripts: [], mcp: [], env: [], services: [] },
    risk: { level: "low", findings: [] },
    signals: {},
    scores: {
      total: 50,
      quality: 50,
      trust: 50,
      freshness: 50,
      compatibility: 50,
      adoption: 50,
      reasons: [],
      rubricVersion: "heuristic-v0",
      evaluatedAt: "2026-10-05T00:00:00.000Z",
    },
    provenanceTier: "local",
    ...partial,
  })
}
