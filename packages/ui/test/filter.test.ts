// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { filterSkills, type SkillCard } from "../src/lib/contract.ts"
import "./setup"

const card = (id: string, over: Partial<SkillCard> = {}): SkillCard => ({
  id,
  name: id.split("/").at(-1) ?? id,
  description: "does a thing",
  category: "engineering",
  labels: [],
  tags: ["test"],
  clusterId: "c-1",
  clusterLabel: "Testing",
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

describe("filterSkills", () => {
  const cards = [
    card("a/pdf-tool", { name: "PDF Tool", description: "extract text from pdf", total: 90, category: "writing" }),
    card("a/seo-audit", { name: "SEO Audit", description: "audit a website", total: 70, risk: "medium" }),
    card("a/k8s", { name: "K8s Helper", description: "cluster operations", total: 60, status: "quarantined", provenance: "local" }),
  ]

  it("matches all query terms across id, name, description and tags", () => {
    expect(filterSkills(cards, { q: "pdf" }).items.map((c) => c.id)).toEqual(["a/pdf-tool"])
    expect(filterSkills(cards, { q: "acme pdf" }).items.map((c) => c.id)).toEqual(["a/pdf-tool"])
    expect(filterSkills(cards, { q: "nothing" }).items).toEqual([])
  })

  it("filters by facets and sorts", () => {
    expect(filterSkills(cards, { status: "quarantined" }).items.map((c) => c.id)).toEqual(["a/k8s"])
    expect(filterSkills(cards, { risk: "medium" }).items.map((c) => c.id)).toEqual(["a/seo-audit"])
    expect(filterSkills(cards, { provenance: "local" }).items.map((c) => c.id)).toEqual(["a/k8s"])
    expect(filterSkills(cards, { category: "writing" }).items.map((c) => c.id)).toEqual(["a/pdf-tool"])
    expect(filterSkills(cards, { sort: "name" }).items.map((c) => c.name)).toEqual(["K8s Helper", "PDF Tool", "SEO Audit"])
    expect(filterSkills(cards, { sort: "score" }).items.map((c) => c.total)).toEqual([90, 70, 60])
  })

  it("paginates deterministically", () => {
    const page = filterSkills(cards, { page: 2, pageSize: 2 })
    expect(page.total).toBe(3)
    expect(page.items.map((c) => c.id)).toEqual(["a/k8s"])
    expect(filterSkills(cards, { pageSize: 0 }).pageSize).toBe(48)
  })
})
