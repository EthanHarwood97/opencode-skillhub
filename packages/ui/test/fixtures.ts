import type { SkillCard } from "../src/lib/contract.ts"

export const card = (id: string, over: Partial<SkillCard> = {}): SkillCard => ({
  id,
  name: id.split("/").at(-1) ?? id,
  description: "does a thing",
  category: "engineering",
  tags: ["test"],
  clusterId: "c-1",
  clusterLabel: "Fixture",
  total: 50,
  freshness: 70,
  risk: "low",
  provenance: "sha-pinned",
  status: "candidate",
  sourceKind: "github",
  sourceRepo: "acme/skills",
  installed: false,
  active: false,
  updateAvailable: false,
  ...over,
})
