import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"
import { buildClusters } from "../src/cluster.ts"
import { writeCatalog } from "../src/publish.ts"
import { makeRecord } from "./helpers.ts"

const now = new Date("2026-10-05T00:00:00Z")

describe("buildClusters", () => {
  it("groups by category and primary tag with a top record", () => {
    const records = [
      makeRecord({ id: "a/one", category: "writing", tags: ["seo"], scores: { ...makeRecord({ id: "z" }).scores, total: 90 } }),
      makeRecord({ id: "a/two", category: "writing", tags: ["seo"], scores: { ...makeRecord({ id: "z" }).scores, total: 70 } }),
    ]
    const clusters = buildClusters(records, now)
    expect(clusters.clusters).toHaveLength(1)
    expect(clusters.clusters[0]?.id).toBe("writing/seo")
    expect(clusters.clusters[0]?.top).toBe("a/one")
    expect(clusters.clusters[0]?.alternatives).toContain("a/two")
  })
})

describe("writeCatalog", () => {
  it("writes index.json, clusters.json, and a queryable search.db", () => {
    const out = mkdtempSync(join(tmpdir(), "skillhub-publish-"))
    const records = [
      makeRecord({ id: "acme/good", category: "writing", tags: ["seo"], scores: { ...makeRecord({ id: "z" }).scores, total: 90 } }),
      makeRecord({ id: "acme/other", category: "engineering", tags: ["testing"], status: "quarantined" }),
    ]
    const { index } = writeCatalog(records, out, now)

    expect(index.counts.total).toBe(2)
    expect(index.counts.byStatus.quarantined).toBe(1)
    expect(JSON.parse(readFileSync(join(out, "index.json"), "utf8")).skills[0].id).toBe("acme/good")

    const db = new DatabaseSync(join(out, "search.db"))
    const rows = db.prepare("SELECT id FROM skills_fts WHERE skills_fts MATCH ?").all("seo")
    expect(rows.map((r: any) => r.id)).toEqual(["acme/good"])
  })

  it("is byte-stable for the same input", () => {
    const a = mkdtempSync(join(tmpdir(), "skillhub-a-"))
    const b = mkdtempSync(join(tmpdir(), "skillhub-b-"))
    const records = [makeRecord({ id: "acme/good" })]
    writeCatalog(records, a, now)
    writeCatalog(records, b, now)
    expect(readFileSync(join(a, "index.json"), "utf8")).toBe(readFileSync(join(b, "index.json"), "utf8"))
  })
})
