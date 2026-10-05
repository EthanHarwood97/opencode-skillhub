import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { makeRecord } from "../../catalog/test/helpers.ts"
import { applyCalibration, runCalibrate, runLabelExport, runLabelImport } from "../src/commands/depth.ts"
import { layout } from "../src/paths.ts"

const withParts = (id: string, parts: { quality: number; trust: number; freshness: number; compatibility: number; adoption: number }) =>
  makeRecord({ id, scores: { ...makeRecord({ id }).scores, ...parts, reasons: [] } })

const writeIndex = (l: ReturnType<typeof layout>, skills: unknown[]) => {
  mkdirSync(l.catalogDir, { recursive: true })
  writeFileSync(join(l.catalogDir, "index.json"), JSON.stringify({ version: 1, generatedAt: "", counts: { total: skills.length, byStatus: {}, byCategory: {} }, skills }))
}

describe("calibrate command", () => {
  it("improves agreement and writes the calibration file", () => {
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-cli-depth-")))
    writeIndex(l, [
      withParts("a/x", { quality: 90, trust: 50, freshness: 50, compatibility: 50, adoption: 0 }),
      withParts("a/y", { quality: 40, trust: 100, freshness: 100, compatibility: 100, adoption: 100 }),
    ])
    const goldenPath = join(l.root, "golden.json")
    writeFileSync(goldenPath, JSON.stringify({ version: 1, labels: [{ id: "a/x", tier: 1 }, { id: "a/y", tier: 2 }] }))
    const result = runCalibrate(l, goldenPath)
    expect(result.agreement).toBeGreaterThan(result.baselineAgreement)
    const written = applyCalibration(l, result, new Date("2026-10-05T00:00:00Z"))
    expect(readFileSync(written, "utf8")).toContain("weights")
  })
})

describe("label command", () => {
  it("exports a worksheet and imports a golden set", () => {
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-cli-label-")))
    writeIndex(l, [1, 2, 3].map((i) => makeRecord({ id: `a/s${i}` })))
    const tsvPath = join(l.root, "worksheet.tsv")
    expect(runLabelExport(l, tsvPath, 2)).toBe(2)
    const lines = readFileSync(tsvPath, "utf8").trim().split("\n")
    const filled = [`${lines[0]}`, ...lines.slice(1).map((line, i) => `${line.replace(/\t*$/, "")}\t${i + 1}\t`)]
    writeFileSync(tsvPath, filled.join("\n") + "\n")
    const outPath = join(l.root, "golden.json")
    expect(runLabelImport(tsvPath, outPath)).toBe(2)
    const golden = JSON.parse(readFileSync(outPath, "utf8"))
    expect(golden.labels[0].tier).toBe(1)
    expect(golden.version).toBe(1)
  })
})
