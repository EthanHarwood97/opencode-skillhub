import type { Cluster, ClustersFile } from "./cluster-types.ts"
import type { SkillRecord } from "./types.ts"

export function assignCluster(record: Pick<SkillRecord, "category" | "tags">): { clusterId: string; clusterLabel: string } {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  const primary = (record.tags[0] ?? "general").trim()
  return {
    clusterId: `${slug(record.category)}/${slug(primary)}`,
    clusterLabel: primary.replace(/\b\w/g, (c) => c.toUpperCase()),
  }
}

export function buildClusters(records: SkillRecord[], now: Date): ClustersFile {
  const byId = new Map<string, SkillRecord[]>()
  for (const record of records) {
    const list = byId.get(record.clusterId) ?? []
    list.push(record)
    byId.set(record.clusterId, list)
  }
  const clusters: Cluster[] = [...byId.entries()]
    .map(([id, list]) => {
      const ranked = [...list].sort((a, b) => b.scores.total - a.scores.total || a.id.localeCompare(b.id))
      return {
        id,
        label: ranked[0]?.clusterLabel ?? id,
        category: ranked[0]?.category ?? "unknown",
        top: ranked[0]?.id ?? "",
        alternatives: ranked.slice(1, 3).map((r) => r.id),
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  return { version: 1, generatedAt: now.toISOString(), clusters }
}
