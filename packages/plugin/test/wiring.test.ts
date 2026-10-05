import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { readUsage, usageFileFor } from "../src/manage-core.ts"
import { renderStatus } from "../src/status-core.ts"
import { collectStatus, listManagedAdverts } from "../src/wiring.ts"
import { SkillHubPlugin } from "../src/plugin.ts"

describe("listManagedAdverts", () => {
  it("reads managed skill frontmatter", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    const dir = join(root, "managed", "a", "one")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), "---\nname: one\ndescription: does one thing\n---\n\n# One\n")
    const adverts = listManagedAdverts(root)
    expect(adverts).toEqual([{ id: "a/one", name: "one", description: "does one thing" }])
  })

  it("walks nested install layouts (store file path under the id dir)", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    const dir = join(root, "managed", "acme-skills", "good-skill", "good-skill")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), "---\nname: good-skill\ndescription: Demonstrates a well-formed skill.\n---\n\n# Good Skill\n")
    const adverts = listManagedAdverts(root)
    expect(adverts).toEqual([{ id: "acme-skills/good-skill", name: "good-skill", description: "Demonstrates a well-formed skill." }])
  })

  it("keeps exactly one advert per id, preferring the shallower file", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    const skillDir = join(root, "managed", "acme-skills", "good-skill", "good-skill")
    const refDir = join(root, "managed", "acme-skills", "good-skill", "ref")
    mkdirSync(skillDir, { recursive: true })
    mkdirSync(refDir, { recursive: true })
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: good-skill\ndescription: installed skill body\n---\n\n# Good Skill\n")
    writeFileSync(join(refDir, "SKILL.md"), "---\nname: ref-example\ndescription: bundled reference decoy\n---\n\n# Ref\n")
    const adverts = listManagedAdverts(root)
    expect(adverts).toEqual([{ id: "acme-skills/good-skill", name: "good-skill", description: "installed skill body" }])
  })

  it("prefers the lock-pointed SKILL.md over an earlier-sorting decoy", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    const idDir = join(root, "managed", "acme-skills", "good-skill")
    const realDir = join(idDir, "good-skill")
    const decoyDir = join(idDir, "aaa-ref")
    mkdirSync(realDir, { recursive: true })
    mkdirSync(decoyDir, { recursive: true })
    writeFileSync(join(realDir, "SKILL.md"), "---\nname: good-skill\ndescription: installed skill body\n---\n\n# Good Skill\n")
    writeFileSync(join(decoyDir, "SKILL.md"), "---\nname: ref-example\ndescription: bundled reference decoy\n---\n\n# Ref\n")
    writeFileSync(
      join(root, "lockfile.json"),
      JSON.stringify({ version: 1, skills: { "acme-skills/good-skill": { id: "acme-skills/good-skill", active: true, contentHash: "x", files: [{ path: "good-skill/SKILL.md", sha256: "0", size: 1 }] } } }),
    )
    expect(listManagedAdverts(root)).toEqual([{ id: "acme-skills/good-skill", name: "good-skill", description: "installed skill body" }])
  })

  it("ignores SKILL.md paths shallower than <org>/<name>/", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    mkdirSync(join(root, "managed", "stray"), { recursive: true })
    writeFileSync(join(root, "managed", "SKILL.md"), "---\nname: top\n---\n")
    writeFileSync(join(root, "managed", "stray", "SKILL.md"), "---\nname: stray\n---\n")
    expect(listManagedAdverts(root)).toEqual([])
  })
})

describe("collectStatus", () => {
  it("counts updates from hash drift and composes the budget", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    mkdirSync(join(root, "catalog"), { recursive: true })
    const dir = join(root, "managed", "a", "one")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), "---\nname: one\ndescription: does one thing\n---\n")
    writeFileSync(
      join(root, "lockfile.json"),
      JSON.stringify({ version: 1, skills: { "a/one": { id: "a/one", contentHash: "old", active: true, files: [], provenanceTier: "sha-pinned", installedAt: "", riskLevel: "low", total: 1 } } }),
    )
    writeFileSync(
      join(root, "catalog", "index.json"),
      JSON.stringify({ version: 1, generatedAt: "", counts: { total: 1, byStatus: {}, byCategory: {} }, skills: [{ id: "a/one", name: "one", description: "d", category: "c", tags: [], clusterId: "c/x", clusterLabel: "X", source: { kind: "local", path: "p", licenseFlags: [] }, files: [], contentHash: "new", requires: { runtime: [], scripts: [], mcp: [], env: [], services: [] }, risk: { level: "low", findings: [] }, signals: {}, scores: { total: 1, quality: 1, trust: 1, freshness: 1, compatibility: 1, adoption: 1, reasons: [], rubricVersion: "heuristic-v0", evaluatedAt: "" }, provenanceTier: "local", status: "candidate", relations: { supersedes: [], duplicates: [], alternatives: [] } }] }),
    )
    const status = collectStatus(root, "C:/proj", new Date("2026-10-05T00:00:00Z"))
    expect(status.updates).toBe(1)
    expect(status.active).toEqual(["a/one"])
    expect(status.l1Tokens).toBeGreaterThan(0)
    expect(status.l0Tokens).toBeGreaterThan(0)
  })

  it("suggests demotions for least-used adverts over budget", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    const big = "x".repeat(4000)
    const mk = (name: string, description: string) => {
      const dir = join(root, "managed", "a", name)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n`)
    }
    mk("keep", "")
    mk("hot", big)
    mk("old", big)
    writeFileSync(
      join(root, "lockfile.json"),
      JSON.stringify({
        version: 1,
        skills: Object.fromEntries(["a/keep", "a/hot", "a/old"].map((id) => [id, { id, active: true, contentHash: "x", files: [] }])),
      }),
    )
    const usageFile = usageFileFor(root, "C:/proj")
    mkdirSync(dirname(usageFile), { recursive: true })
    writeFileSync(usageFile, JSON.stringify({ version: 1, searches: 0, loads: { "a/keep": { count: 10, lastAt: "" }, "a/hot": { count: 5, lastAt: "" } } }))
    const status = collectStatus(root, "C:/proj")
    expect(status.demote).toEqual(["a/hot", "a/old"])
    const text = renderStatus(status)
    expect(text).toContain("demote suggestions: a/hot, a/old")
    expect(text).toContain("over budget")
  })

  it("suggests a better-ranked same-cluster candidate for an active install", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    mkdirSync(join(root, "catalog"), { recursive: true })
    const record = (id: string, total: number) => ({
      id,
      name: id,
      description: "d",
      category: "c",
      tags: [],
      clusterId: "c/x",
      clusterLabel: "X",
      source: { kind: "local", path: "p", licenseFlags: [] },
      files: [],
      contentHash: "h",
      requires: { runtime: [], scripts: [], mcp: [], env: [], services: [] },
      risk: { level: "low", findings: [] },
      signals: {},
      scores: { total, quality: total, trust: total, freshness: total, compatibility: total, adoption: total, reasons: [], rubricVersion: "heuristic-v0", evaluatedAt: "" },
      provenanceTier: "local",
      status: "candidate",
      relations: { supersedes: [], duplicates: [], alternatives: [] },
    })
    writeFileSync(
      join(root, "catalog", "index.json"),
      JSON.stringify({ version: 1, generatedAt: "", counts: { total: 2, byStatus: {}, byCategory: {} }, skills: [record("a/old", 50), record("a/new", 70)] }),
    )
    writeFileSync(
      join(root, "lockfile.json"),
      JSON.stringify({ version: 1, skills: { "a/old": { id: "a/old", active: true, contentHash: "h", total: 50, files: [] } } }),
    )
    const status = collectStatus(root, "C:/proj")
    expect(status.upgrades).toHaveLength(1)
    expect(status.upgrades[0]).toMatchObject({ from: "a/old", to: "a/new", fromTotal: 50, toTotal: 70 })
  })
})

describe("SkillHubPlugin", () => {
  it("wires exactly the router and load tools", async () => {
    const input = {
      client: { tui: { showToast: async () => ({}) } },
      directory: "C:/proj",
    } as any
    const hooks = await SkillHubPlugin(input)
    expect(Object.keys(hooks.tool!)).toEqual(["skillhub_search", "skillhub_load"])
  })

  it("does not record a search when the runtime query fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    const prev = process.env.SKILLHUB_HOME
    process.env.SKILLHUB_HOME = root
    try {
      const hooks = await SkillHubPlugin({ client: { tui: { showToast: async () => ({}) } }, directory: "C:/proj" } as any)
      await expect((hooks.tool!.skillhub_search as any).execute({ query: "anything" })).rejects.toThrow(/bun:sqlite/)
      expect(readUsage(usageFileFor(root, "C:/proj")).searches).toBe(0)
    } finally {
      if (prev === undefined) delete process.env.SKILLHUB_HOME
      else process.env.SKILLHUB_HOME = prev
    }
  })
})
