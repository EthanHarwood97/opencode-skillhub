import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { adoptSkillDirectory, adoptTree, repairLocalSkills, slugSkillName } from "../src/adopt.ts"
import { parseSkillMd } from "../../catalog/src/parse.ts"
import { readLockfile } from "../src/lockfile.ts"
import { layout, type StoreLayout } from "../src/paths.ts"

const makeSkill = (root: string, name: string, extra: Record<string, string> = {}): string => {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: A local fixture skill.\n---\n\n# ${name}\n`)
  for (const [path, content] of Object.entries(extra)) {
    const target = join(dir, path)
    mkdirSync(join(target, ".."), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

const makeLayout = (): StoreLayout => layout(mkdtempSync(join(tmpdir(), "skillhub-adopt-")))

describe("adopt", () => {
  it("stores, activates, pins, and hashes a local skill folder", () => {
    const l = makeLayout()
    const source = makeSkill(l.root, "master-writer", { "references/guide.md": "# Guide\n" })
    const entry = adoptSkillDirectory(l, source, { now: new Date("2026-10-06T00:00:00Z") })

    expect(entry.id).toBe("local/master-writer")
    expect(entry).toMatchObject({ active: true, pinned: true, provenanceTier: "local" })
    expect(entry.files.map((file) => file.path).sort()).toEqual(["SKILL.md", "references/guide.md"])
    expect(readLockfile(l.lockfilePath).skills["local/master-writer"]?.active).toBe(true)
    expect(readFileSync(join(l.storeDir, "local/master-writer", "SKILL.md"), "utf8")).toContain("master-writer")
    expect(readFileSync(join(l.managedDir, "local/master-writer", "SKILL.md"), "utf8")).toContain("name: master-writer")
  })

  it("normalizes a mismatched frontmatter name in the managed copy", () => {
    const l = makeLayout()
    const source = makeSkill(l.root, "wowfactor-web")
    writeFileSync(join(source, "SKILL.md"), "---\nname: wowfactor\n---\n\n# Wow\n")
    adoptSkillDirectory(l, source)
    const managed = readFileSync(join(l.managedDir, "local/wowfactor-web", "SKILL.md"), "utf8")
    expect(managed).toContain("name: wowfactor-web")
  })

  it("slugifies folder names and dedupes within a tree", () => {
    expect(slugSkillName("My Skill!")).toBe("my-skill")
    expect(slugSkillName("--weird--name--")).toBe("weird-name")

    const l = makeLayout()
    const root = join(l.root, "personal")
    makeSkill(root, "alpha")
    makeSkill(root, "beta")
    makeSkill(join(root, "nested"), "alpha") // duplicate name, nested
    const result = adoptTree(l, root)
    expect(result.adopted.map((entry) => entry.name).sort()).toEqual(["alpha", "beta"])
    expect(result.skipped).toEqual([{ name: "alpha", reason: "name already installed" }])
    expect(existsSync(join(l.managedDir, "local/alpha", "SKILL.md"))).toBe(true)
  })

  it("dereferences symlinked folders instead of copying broken links", () => {
    const l = makeLayout()
    const shared = join(l.root, "shared-assets")
    mkdirSync(shared, { recursive: true })
    writeFileSync(join(shared, "asset.md"), "# Asset\n")
    const source = makeSkill(l.root, "linked-skill")
    symlinkSync(shared, join(source, "refs"), process.platform === "win32" ? "junction" : "dir")

    const entry = adoptSkillDirectory(l, source)

    expect(entry.files.map((file) => file.path)).toContain("refs/asset.md")
    const storedRefs = join(l.storeDir, "local/linked-skill", "refs")
    expect(lstatSync(storedRefs).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(storedRefs, "asset.md"), "utf8")).toContain("# Asset")
    const managedRefs = join(l.managedDir, "local/linked-skill", "refs")
    expect(lstatSync(managedRefs).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(managedRefs, "asset.md"), "utf8")).toContain("# Asset")
    expect(statSync(join(managedRefs, "asset.md")).isFile()).toBe(true)
  })

  it("adopts through a junction when the skill folder itself is a link", () => {
    const l = makeLayout()
    const real = makeSkill(l.root, "real-home")
    const link = join(l.root, "linked-home")
    symlinkSync(real, link, process.platform === "win32" ? "junction" : "dir")

    const entry = adoptSkillDirectory(l, link)

    expect(entry.id).toBe("local/linked-home")
    expect(readFileSync(join(l.storeDir, "local/linked-home", "SKILL.md"), "utf8")).toContain("# real-home")
    expect(readFileSync(join(l.managedDir, "local/linked-home", "SKILL.md"), "utf8")).toContain("name: linked-home")
  })

  it("skips names that are already installed (catalog or local)", () => {
    const l = makeLayout()
    adoptSkillDirectory(l, makeSkill(l.root, "taken-skill"))
    const root = join(l.root, "personal")
    const source = makeSkill(root, "taken-skill")
    const result = adoptTree(l, root)
    expect(result.adopted).toEqual([])
    expect(result.skipped).toEqual([{ name: "taken-skill", reason: "name already installed" }])
    expect(existsSync(join(l.managedDir, "local/taken-skill"))).toBe(true)
    expect(source).toBeTruthy()
  })

  it("repairs malformed frontmatter and refreshes the managed copy", () => {
    const l = makeLayout()
    const source = makeSkill(l.root, "broken-skill")
    writeFileSync(join(source, "SKILL.md"), `---\nname: broken-skill\ndescription: Triggers on: "convert to pdf", "make a pdf" and more.\n---\n\n# Broken\n`)
    adoptSkillDirectory(l, source)
    const before = readLockfile(l.lockfilePath).skills["local/broken-skill"]!.contentHash

    const results = repairLocalSkills(l)

    expect(results).toEqual([{ name: "broken-skill", changed: true, reason: "repaired frontmatter" }])
    const fixed = readFileSync(join(l.storeDir, "local/broken-skill", "SKILL.md"), "utf8")
    expect(() => parseSkillMd(fixed)).not.toThrow()
    expect(fixed).toContain("name: broken-skill")
    expect(fixed).toContain('# Broken')
    expect(readLockfile(l.lockfilePath).skills["local/broken-skill"]!.contentHash).not.toBe(before)
    expect(readFileSync(join(l.managedDir, "local/broken-skill", "SKILL.md"), "utf8")).toContain("description: 'Triggers on: \"convert to pdf\"")
  })

  it("leaves healthy local skills untouched", () => {
    const l = makeLayout()
    adoptSkillDirectory(l, makeSkill(l.root, "healthy-skill"))
    expect(repairLocalSkills(l)).toEqual([{ name: "healthy-skill", changed: false }])
  })
})
