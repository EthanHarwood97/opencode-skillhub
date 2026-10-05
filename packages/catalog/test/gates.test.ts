import { describe, expect, it } from "vitest"
import { runGates } from "../src/gates.ts"
import { SignalsSchema, SourceSchema } from "../src/types.ts"
import type { ParsedSkill } from "../src/parse.ts"

const parsed: ParsedSkill = { name: "x", description: "d", body: "# x\n", raw: "" }
const now = new Date("2026-10-05T00:00:00Z")

const base = {
  parsed,
  signals: SignalsSchema.parse({ pushedAt: "2026-09-01T00:00:00Z" }),
  source: SourceSchema.parse({ kind: "github", repo: "a/b", path: "s/SKILL.md" }),
  filesPresent: [true],
  now,
}

describe("runGates", () => {
  it("passes a healthy candidate", () => {
    const results = runGates(base)
    expect(results.map((r) => [r.gate, r.passed])).toEqual([
      ["frontmatter", true],
      ["maintenance", true],
      ["license", false],
      ["files", true],
      ["scan", true],
    ])
  })

  it("fails maintenance when repo idles past 18 months", () => {
    const results = runGates({
      ...base,
      signals: SignalsSchema.parse({ pushedAt: "2024-01-01T00:00:00Z" }),
      source: SourceSchema.parse({ kind: "github", repo: "a/b", path: "s/SKILL.md", license: "MIT" }),
    })
    expect(results.find((r) => r.gate === "maintenance")?.passed).toBe(false)
  })

  it("fails scan when risk is critical", () => {
    const results = runGates({
      ...base,
      source: SourceSchema.parse({ kind: "local", path: "s/SKILL.md", license: "MIT" }),
      risk: { level: "critical", findings: [] },
    })
    expect(results.find((r) => r.gate === "scan")?.passed).toBe(false)
  })

  it("exempts local skills from the maintenance clock", () => {
    const results = runGates({
      ...base,
      signals: SignalsSchema.parse({}),
      source: SourceSchema.parse({ kind: "local", path: "s/SKILL.md", license: "MIT" }),
    })
    expect(results.find((r) => r.gate === "maintenance")?.passed).toBe(true)
  })
})
