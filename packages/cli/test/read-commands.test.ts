import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildCatalog } from "../../catalog/src/build.ts"
import { loadFixtureCandidates } from "../../catalog/src/sources/fixtures.ts"
import { layout } from "../src/paths.ts"
import { importCatalog } from "../src/catalog-cache.ts"
import { searchSkills } from "../src/search.ts"
import { findRecord, readCatalog, whyLines } from "../src/commands/read.ts"

const fixtures = fileURLToPath(new URL("../../../fixtures/skills", import.meta.url))

const prepared = () => {
  const l = layout(mkdtempSync(join(tmpdir(), "skillhub-read-")))
  const built = join(l.root, "built")
  buildCatalog({ candidates: loadFixtureCandidates(fixtures), outDir: built, now: new Date("2026-10-05T00:00:00Z") })
  importCatalog(built, l)
  return l
}

describe("searchSkills", () => {
  it("finds records by FTS query and filters by category", () => {
    const l = prepared()
    const hits = searchSkills(join(l.catalogDir, "search.db"), "good")
    expect(hits.map((h) => h.id)).toContain("local/good-skill")
    expect(searchSkills(join(l.catalogDir, "search.db"), "good", { category: "writing" })).toHaveLength(0)
  })
})

describe("read commands", () => {
  it("finds a record and renders why lines from score reasons", () => {
    const l = prepared()
    const index = readCatalog(l)
    const record = findRecord(index, "local/good-skill")
    expect(record?.scores.total).toBeGreaterThan(0)
    expect(whyLines(record!).join("\n")).toMatch(/trust:/)
  })
})
