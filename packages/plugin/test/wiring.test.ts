import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
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
})
