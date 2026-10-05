import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { makeRecord } from "../../catalog/test/helpers.ts"
import { layout } from "../src/paths.ts"
import { exportStaticSite } from "../src/ui/export.ts"

const makeStore = (records = 2) => {
  const root = mkdtempSync(join(tmpdir(), "skillhub-ui-export-"))
  const l = layout(root)
  mkdirSync(l.catalogDir, { recursive: true })
  writeFileSync(
    join(l.catalogDir, "index.json"),
    JSON.stringify({
      version: 1,
      generatedAt: "2026-10-05T00:00:00.000Z",
      counts: { total: records, byStatus: { candidate: records }, byCategory: {} },
      skills: Array.from({ length: records }, (_, i) => makeRecord({ id: `acme/s${i}` })),
    }),
  )
  const dist = join(root, "dist")
  mkdirSync(join(dist, "assets"), { recursive: true })
  writeFileSync(join(dist, "index.html"), "<html><head></head><body><div id=\"root\"></div></body></html>")
  writeFileSync(join(dist, "assets", "app.js"), "app")
  return { root, l, dist }
}

describe("exportStaticSite", () => {
  it("writes a static gallery bundle", () => {
    const { l, dist } = makeStore()
    const out = join(l.root, "site")
    const result = exportStaticSite({ l, outDir: out, uiDist: dist, maxRecords: 10 })
    expect(result.skills).toBe(2)
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain('window.__SKILLHUB__={"mode":"static"}')
    const skills = JSON.parse(readFileSync(join(out, "data", "skills.json"), "utf8"))
    expect(skills).toHaveLength(2)
    expect(skills[0].id).toBe("acme/s0")
    expect(existsSync(join(out, "data", "status.json"))).toBe(true)
    expect(existsSync(join(out, "data", "review.json"))).toBe(true)
    expect(readFileSync(join(out, "assets", "app.js"), "utf8")).toBe("app")
  })

  it("caps records with a warning and refuses a non-empty target", () => {
    const { l, dist } = makeStore(3)
    const out = join(l.root, "site")
    const result = exportStaticSite({ l, outDir: out, uiDist: dist, maxRecords: 2 })
    expect(JSON.parse(readFileSync(join(out, "data", "skills.json"), "utf8"))).toHaveLength(2)
    expect(result.warnings.join(" ")).toContain("2 of 3")
    expect(() => exportStaticSite({ l, outDir: out, uiDist: dist })).toThrow(/not empty/)
    expect(() => exportStaticSite({ l, outDir: out, uiDist: dist, force: true })).not.toThrow()
  })

  it("rejects an invalid max-records cap", () => {
    const { l, dist } = makeStore()
    expect(() => exportStaticSite({ l, outDir: join(l.root, "bad"), uiDist: dist, maxRecords: Number.NaN })).toThrow(/positive integer/)
    expect(() => exportStaticSite({ l, outDir: join(l.root, "bad"), uiDist: dist, maxRecords: -1 })).toThrow(/positive integer/)
  })
})
