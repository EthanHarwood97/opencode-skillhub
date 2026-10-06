import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadLocalSkills } from "../src/sources/local.ts"

const makeSkill = (root: string, name: string, files: Record<string, string> = {}): string => {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: Local fixture.\n---\n\n# ${name}\n`)
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path)
    mkdirSync(join(target, ".."), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

describe("loadLocalSkills", () => {
  it("loads top-level skill folders with all files and local source metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-local-src-"))
    makeSkill(root, "alpha", { "references/guide.md": "# Guide\n" })
    makeSkill(root, "beta")
    mkdirSync(join(root, "not-a-skill"), { recursive: true })

    const candidates = loadLocalSkills(root)
    expect(candidates.map((candidate) => candidate.name).sort()).toEqual(["alpha", "beta"])
    const alpha = candidates.find((candidate) => candidate.name === "alpha")!
    expect(alpha.source).toMatchObject({ kind: "local", licenseFlags: ["unknown-license"] })
    expect(alpha.files.map((file) => file.path).sort()).toEqual(["SKILL.md", "references/guide.md"])
    expect(alpha.files.every((file) => file.bytes !== undefined && file.content !== undefined)).toBe(true)
  })

  it("returns nothing for a missing root", () => {
    expect(loadLocalSkills(join(tmpdir(), "skillhub-definitely-missing-root"))).toEqual([])
  })

  it("follows junctioned skill folders", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-local-link-"))
    const real = makeSkill(mkdtempSync(join(tmpdir(), "skillhub-local-real-")), "linked")
    symlinkSync(real, join(root, "linked"), process.platform === "win32" ? "junction" : "dir")
    const candidates = loadLocalSkills(root)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.files.some((file) => file.path === "SKILL.md")).toBe(true)
  })
})
