import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { makeLoadTool, makeSpill, readSkillBodyFromDisk, renderLoadResult } from "../src/load-core.ts"

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

  it("resolves the lock-pointed SKILL.md ahead of an earlier-sorting decoy", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-load-"))
    const id = "acme-skills/good-skill"
    const realDir = join(root, "managed", "acme-skills", "good-skill", "good-skill")
    const decoyDir = join(root, "managed", "acme-skills", "good-skill", "aaa-ref")
    mkdirSync(realDir, { recursive: true })
    mkdirSync(decoyDir, { recursive: true })
    writeFileSync(join(realDir, "SKILL.md"), body)
    writeFileSync(join(decoyDir, "SKILL.md"), "# Decoy\n")
    writeFileSync(
      join(root, "lockfile.json"),
      JSON.stringify({ version: 1, skills: { [id]: { id, active: true, contentHash: "x", files: [{ path: "good-skill/SKILL.md", sha256: "0", size: 1 }] } } }),
    )
    expect(readSkillBodyFromDisk(root, id)).toBe(body)
  })

  it("rejects traversal-shaped ids", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-load-"))
    expect(readSkillBodyFromDisk(root, "../../etc")).toBeUndefined()
    expect(readSkillBodyFromDisk(root, "a/../b")).toBeUndefined()
    expect(readSkillBodyFromDisk(root, "a/b/c")).toBeUndefined()
  })
})

describe("makeSpill", () => {
  it("writes the body under tmp/loads and returns the path", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-spill-"))
    const spill = makeSpill(root)
    const path = await spill("# Big\n", "acme-skills/good-skill")
    expect(path).toBe(join(root, "tmp", "loads", "acme-skills-good-skill.md"))
    expect(readFileSync(path, "utf8")).toBe("# Big\n")
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
  it("rejects invalid ids without asking or reading", async () => {
    const ask = vi.fn(async () => {})
    const read = vi.fn(async () => "# Body\n")
    const t = makeLoadTool({ read })
    const out = await t.execute({ id: "../../etc" }, { ask } as any)
    expect(typeof out === "string" ? out : out.output).toBe('SkillHub: invalid skill id "../../etc"')
    expect(ask).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })
  it("records a load for hits but not for misses", async () => {
    const onLoad = vi.fn()
    const hit = makeLoadTool({ read: async () => "# Body\n", onLoad })
    await hit.execute({ id: "a/x" }, { ask: async () => {} } as any)
    expect(onLoad).toHaveBeenCalledTimes(1)
    expect(onLoad).toHaveBeenCalledWith("a/x")
    const miss = makeLoadTool({ read: async () => undefined, onLoad })
    await miss.execute({ id: "a/nope" }, { ask: async () => {} } as any)
    expect(onLoad).toHaveBeenCalledTimes(1)
  })
  it("survives a telemetry failure", async () => {
    const sync = makeLoadTool({ read: async () => "# Body\n", onLoad: () => { throw new Error("boom") } })
    const syncOut = await sync.execute({ id: "a/x" }, { ask: async () => {} } as any)
    expect(typeof syncOut === "string" ? syncOut : syncOut.output).toContain("# Body")
    const asyncT = makeLoadTool({ read: async () => "# Body\n", onLoad: async () => { throw new Error("async boom") } })
    const asyncOut = await asyncT.execute({ id: "a/x" }, { ask: async () => {} } as any)
    expect(typeof asyncOut === "string" ? asyncOut : asyncOut.output).toContain("# Body")
  })
  it("spills oversized bodies through the configured spill target", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-load-spill-"))
    const big = "x".repeat(60_000)
    const t = makeLoadTool({ read: async () => big, spill: makeSpill(root) })
    const out = await t.execute({ id: "a/x" }, { ask: async () => {} } as any)
    const text = typeof out === "string" ? out : out.output
    expect(text).toContain(join(root, "tmp", "loads", "a-x.md"))
    expect(text).not.toContain(big)
  })
})
