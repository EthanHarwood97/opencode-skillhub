import { describe, expect, it } from "vitest"
import { labelTemplateTsv, parseLabelTsv, sampleForLabeling } from "../src/label.ts"
import { GoldenSetSchema } from "../src/calibrate.ts"
import { makeRecord } from "./helpers.ts"

const records = Array.from({ length: 10 }, (_, i) =>
  makeRecord({ id: `a/s${i}`, scores: { ...makeRecord({ id: "z" }).scores, total: 100 - i * 5 } }),
)

describe("sampleForLabeling", () => {
  it("spreads the sample across the score range", () => {
    const sample = sampleForLabeling(records, 3)
    expect(sample.map((r) => r.id)).toEqual(["a/s0", "a/s4", "a/s9"])
  })
  it("returns all candidates when the limit exceeds the pool", () => {
    expect(sampleForLabeling(records, 50)).toHaveLength(10)
  })
})

describe("label TSV", () => {
  it("exports a header plus one row per record", () => {
    const tsv = labelTemplateTsv(records.slice(0, 2))
    const lines = tsv.trim().split("\n")
    expect(lines[0]).toBe("id\tname\tcategory\tcluster\tscore\ttier\tnotes")
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain("a/s0")
  })
  it("parses filled tiers and skips blank rows", () => {
    const tsv = [
      "id\tname\tcategory\tcluster\tscore\ttier\tnotes",
      "a/s0\ts0\tengineering\tc-1\t100\t1\tgreat",
      "a/s1\ts1\tengineering\tc-1\t95\t\tnot labelled",
      "a/s2\ts2\tengineering\tc-2\t90\t4\tweak",
    ].join("\n")
    const golden = parseLabelTsv(tsv)
    expect(golden.labels).toEqual([
      { id: "a/s0", tier: 1 },
      { id: "a/s2", tier: 4 },
    ])
    expect(GoldenSetSchema.safeParse(golden).success).toBe(true)
  })
  it("throws on an invalid tier", () => {
    const tsv = "id\tname\tcategory\tcluster\tscore\ttier\tnotes\na/s0\ts0\tc\tc\t1\t9\t"
    expect(() => parseLabelTsv(tsv)).toThrow(/invalid tier/)
  })
})
