import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { makeRecord } from "../../catalog/test/helpers.ts"
import { formatCoverage, runCoverage } from "../src/commands/coverage.ts"
import { layout } from "../src/paths.ts"

const writeIndex = (l: ReturnType<typeof layout>, skills: unknown[]) => {
  mkdirSync(l.catalogDir, { recursive: true })
  writeFileSync(join(l.catalogDir, "index.json"), JSON.stringify({ version: 1, generatedAt: "", counts: { total: skills.length, byStatus: {}, byCategory: {} }, skills }))
}

const rec = (id: string, category: string, total: number) =>
  makeRecord({ id, category, scores: { ...makeRecord({ id }).scores, total } })

describe("coverage command", () => {
  it("lists all seven profiles and reports an honest gap", () => {
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-cli-coverage-")))
    writeIndex(l, [rec("a/1", "engineering", 70), rec("a/2", "engineering", 80), rec("a/3", "engineering", 90)])

    const results = runCoverage(l)
    expect(results.map((result) => result.profile)).toEqual(["coding", "content", "research", "business-ops", "design-creative", "ai-builder", "game-dev"])
    const coding = results.find((result) => result.profile === "coding")!
    expect(coding.gaps.map((gap) => gap.category)).toContain("testing")

    const output = formatCoverage(results)
    expect(output).toContain("coding")
    expect(output).toContain("testing (0/3)")
  })

  it("formats a fully covered profile with no gaps", () => {
    const output = formatCoverage([
      { profile: "coding", coverage: 100, categories: [], gaps: [] },
    ])
    expect(output).toBe("coding 100% — no gaps")
  })

  it("throws for an unknown profile", () => {
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-cli-coverage-")))
    writeIndex(l, [])
    expect(() => runCoverage(l, "nope")).toThrow(/unknown profile/)
  })
})
