import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { makeLoadTool, readSkillBodyFromDisk, renderLoadResult } from "../src/load-core.ts"

describe("renderLoadResult", () => {
  it("returns the body with a risk line when small", async () => {
    const out = await renderLoadResult({ id: "a/x", body: "# X\n", riskLevel: "low" })
    expect(out).toContain("risk=low")
    expect(out).toContain("# X")
  })
  it("spills oversized bodies to a path hint", async () => {
    const big = "x".repeat(60_000)
    const out = await renderLoadResult({ id: "a/x", body: big, spill: async () => "C:/tmp/skill.md" })
    expect(out).toContain("C:/tmp/skill.md")
    expect(out).not.toContain(big)
  })
})

describe("readSkillBodyFromDisk", () => {
  const body = "---\nname: good-skill\n---\n\n# Good Skill\n"

  it("finds a nested SKILL.md under managed/<id>/<skill-dir>/", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-load-"))
    const dir = join(root, "managed", "acme-skills", "good-skill", "good-skill")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), body)
    expect(readSkillBodyFromDisk(root, "acme-skills/good-skill")).toBe(body)
  })

  it("falls back to the same nested layout under store/", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-load-"))
    const dir = join(root, "store", "acme-skills", "good-skill", "good-skill")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), body)
    expect(readSkillBodyFromDisk(root, "acme-skills/good-skill")).toBe(body)
  })

  it("prefers the direct <base>/<id>/SKILL.md over nested decoys", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-load-"))
    const direct = join(root, "managed", "acme-skills", "good-skill")
    const decoy = join(direct, "ref")
    mkdirSync(decoy, { recursive: true })
    writeFileSync(join(direct, "SKILL.md"), body)
    writeFileSync(join(decoy, "SKILL.md"), "# Decoy\n")
    expect(readSkillBodyFromDisk(root, "acme-skills/good-skill")).toBe(body)
  })
})

describe("makeLoadTool", () => {
  it("asks permission then returns the body", async () => {
    const ask = vi.fn(async () => {})
    const t = makeLoadTool({ read: async () => "# Body\n" })
    const out = await t.execute({ id: "a/x" }, { ask } as any)
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ permission: "skillhub_load", patterns: ["a/x"] }))
    expect(typeof out === "string" ? out : out.output).toContain("# Body")
  })
  it("explains a missing skill instead of throwing", async () => {
    const t = makeLoadTool({ read: async () => undefined })
    const out = await t.execute({ id: "a/nope" }, { ask: async () => {} } as any)
    expect(typeof out === "string" ? out : out.output).toMatch(/not installed|not found/i)
  })
})
