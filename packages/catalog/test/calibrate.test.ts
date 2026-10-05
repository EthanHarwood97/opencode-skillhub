import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { calibrateWeights, GoldenSetSchema, rankAgreement, readCalibration, spearman, writeCalibration } from "../src/calibrate.ts"
import { makeRecord } from "./helpers.ts"

const withParts = (id: string, parts: { quality: number; trust: number; freshness: number; compatibility: number; adoption: number }) =>
  makeRecord({ id, scores: { ...makeRecord({ id }).scores, ...parts, reasons: [] } })

describe("spearman", () => {
  it("is 1 for identical orders and -1 for reversed", () => {
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10)
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10)
  })
  it("averages ties and handles n<2", () => {
    expect(spearman([1, 1, 2], [1, 2, 2])).toBeCloseTo(0.5, 10)
    expect(spearman([1], [1])).toBe(0)
  })
})

describe("calibrateWeights", () => {
  const records = [
    withParts("a/x", { quality: 90, trust: 50, freshness: 50, compatibility: 50, adoption: 0 }),
    withParts("a/y", { quality: 40, trust: 100, freshness: 100, compatibility: 100, adoption: 100 }),
  ]
  const golden = GoldenSetSchema.parse({ version: 1, labels: [{ id: "a/x", tier: 1 }, { id: "a/y", tier: 2 }] })

  it("recognises that the default weights misorder this set", () => {
    expect(rankAgreement(records, golden)).toBeCloseTo(-1, 5)
  })

  it("finds weights that agree with the golden set", () => {
    const result = calibrateWeights(records, golden)
    expect(result.agreement).toBeGreaterThan(result.baselineAgreement)
    expect(result.agreement).toBeCloseTo(1, 5)
    expect(result.gridSize).toBeGreaterThan(1_000)
    expect(Math.abs(result.weights.quality + result.weights.trust + result.weights.freshness + result.weights.compatibility + result.weights.adoption - 1)).toBeLessThan(1e-9)
  })

  it("round-trips the calibration file", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-cal-"))
    const file = join(dir, "calibration.json")
    const result = calibrateWeights(records, golden)
    writeCalibration(file, { version: 1, generatedAt: "2026-10-05T00:00:00.000Z", weights: result.weights, agreement: result.agreement, baselineAgreement: result.baselineAgreement, goldenSize: 2 })
    expect(readCalibration(file)).toEqual(result.weights)
    expect(readCalibration(join(dir, "missing.json"))).toBeUndefined()
    expect(readFileSync(file, "utf8")).toContain("weights")
  })
})
