import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildCatalog } from "../../catalog/src/build.ts"
import { loadFixtureCandidates } from "../../catalog/src/sources/fixtures.ts"
import { sha256 } from "../../catalog/src/parse.ts"
import { activateSkill, applyUpdate, deactivateSkill, planUpdate, diffFiles } from "../src/write-helpers.ts"
import { layout } from "../src/paths.ts"
import { installSkill } from "../src/installer.ts"
import { readLockfile, upsertEntry, writeLockfile } from "../src/lockfile.ts"

const fixtures = fileURLToPath(new URL("../../../fixtures/skills", import.meta.url))

const prepared = async () => {
  const l = layout(mkdtempSync(join(tmpdir(), "skillhub-write-")))
  const built = buildCatalog({ candidates: loadFixtureCandidates(fixtures), outDir: join(l.root, "built"), now: new Date("2026-10-05T00:00:00Z") })
  const local = built.index.skills.find((s) => s.name === "good-skill")!
  const record = { ...local, source: { kind: "github" as const, repo: "acme/skills", path: "good-skill/SKILL.md", ref: "abc123", license: "MIT", licenseFlags: [] } }
  const bytes = new Uint8Array(readFileSync(join(fixtures, "good-skill", "SKILL.md")))
  const entry = await installSkill({ record, l, fetchImpl: (async () => new Response(bytes)) as unknown as typeof fetch, rawBase: "https://raw.test" })
  writeLockfile(l.lockfilePath, upsertEntry({ version: 1, skills: {} }, entry))
  return { l, index: { ...built.index, skills: [record] }, record }
}

describe("diffFiles", () => {
  it("classifies added, removed, and modified files", () => {
    const changes = diffFiles(
      [{ path: "SKILL.md", bytes: new TextEncoder().encode("old\n") }, { path: "gone.md", bytes: new TextEncoder().encode("x\n") }],
      [{ path: "SKILL.md", bytes: new TextEncoder().encode("new\n") }, { path: "extra.md", bytes: new TextEncoder().encode("y\n") }],
    )
    expect(changes.map((c) => [c.path, c.status])).toEqual([
      ["SKILL.md", "modified"],
      ["extra.md", "added"],
      ["gone.md", "removed"],
    ])
    expect(changes.find((c) => c.path === "SKILL.md")?.patch).toContain("-old")
  })
})

describe("update plan", () => {
  it("sees a content-hash change and reports deltas", async () => {
    const { l, index, record } = await prepared()
    const changed = {
      ...record,
      contentHash: "f".repeat(64),
      files: [{ ...record.files[0]!, sha256: "a".repeat(64) }],
      scores: { ...record.scores, total: record.scores.total + 5 },
    }
    const result = planUpdate(l, { ...index, skills: [changed] }, readLockfile(l.lockfilePath), record.id)
    expect(result.kind).toBe("update")
    if (result.kind !== "update") throw new Error("expected update plan")
    expect(result.plan.changes.some((c) => c.status === "modified")).toBe(true)
    expect(result.plan.scoreDelta.to).toBeGreaterThan(result.plan.scoreDelta.from)
  })

  it("reports up-to-date when the installed content matches the catalog", async () => {
    const { l, index, record } = await prepared()
    expect(planUpdate(l, index, readLockfile(l.lockfilePath), record.id).kind).toBe("up-to-date")
  })

  it("reports not-installed when the lockfile has no entry", async () => {
    const { l, index } = await prepared()
    expect(planUpdate(l, index, readLockfile(l.lockfilePath), "acme-skills/other").kind).toBe("not-installed")
  })

  it("blocks an update whose catalog record is not a candidate", async () => {
    const { l, index, record } = await prepared()
    const quarantined = {
      ...record,
      contentHash: "f".repeat(64),
      files: [{ ...record.files[0]!, sha256: "a".repeat(64) }],
      status: "quarantined" as const,
      risk: {
        level: "critical" as const,
        findings: [{ rule: "injection.ignore-previous", category: "injection" as const, severity: "critical" as const, match: "ignore all previous instructions", line: 3 }],
      },
    }
    const result = planUpdate(l, { ...index, skills: [quarantined] }, readLockfile(l.lockfilePath), record.id)
    expect(result.kind).toBe("blocked")
    if (result.kind !== "blocked") throw new Error("expected blocked")
    expect(result.record.status).toBe("quarantined")
  })
})

describe("applyUpdate path guard", () => {
  it("refuses a plan whose file escapes the store and writes nothing", async () => {
    const { l, record } = await prepared()
    const bytes = new Uint8Array(readFileSync(join(fixtures, "good-skill", "SKILL.md")))
    const unsafeRecord = {
      ...record,
      contentHash: "e".repeat(64),
      files: [{ path: "../escape.md", sha256: sha256(bytes), size: bytes.length }],
    }
    const plan = {
      id: record.id,
      from: readLockfile(l.lockfilePath).skills[record.id]!,
      to: unsafeRecord,
      changes: [{ path: "../escape.md", status: "modified" as const }],
      riskDelta: { from: record.risk.level, to: record.risk.level },
      scoreDelta: { from: record.scores.total, to: record.scores.total },
    }
    const fetchImpl = (async () => new Response(bytes)) as unknown as typeof fetch
    await expect(applyUpdate({ plan, l, fetchImpl, rawBase: "https://raw.test" })).rejects.toThrow(/unsafe file path/)
    expect(existsSync(join(l.storeDir, "escape.md"))).toBe(false)
    expect(existsSync(join(l.root, "escape.md"))).toBe(false)
  })
})

describe("applyUpdate pruning", () => {
  it("deletes files removed by the update and writes the new ones", async () => {
    const { l, record } = await prepared()
    const skillBytes = new Uint8Array(readFileSync(join(fixtures, "good-skill", "SKILL.md")))
    const extraBytes = new TextEncoder().encode("extra\n")
    const fromRecord = {
      ...record,
      files: [
        { path: "SKILL.md", sha256: sha256(skillBytes), size: skillBytes.length },
        { path: "extra.md", sha256: sha256(extraBytes), size: extraBytes.length },
      ],
    }
    const fromFetch = (async (url: string | URL) => new Response(String(url).endsWith("extra.md") ? extraBytes : skillBytes)) as unknown as typeof fetch
    const entry = await installSkill({ record: fromRecord, l, fetchImpl: fromFetch, rawBase: "https://raw.test" })
    writeLockfile(l.lockfilePath, upsertEntry({ version: 1, skills: {} }, entry))

    const nextBytes = new TextEncoder().encode("# Good Skill\n\nnew\n")
    const toRecord = { ...fromRecord, contentHash: "d".repeat(64), files: [{ path: "SKILL.md", sha256: sha256(nextBytes), size: nextBytes.length }] }
    const plan = {
      id: record.id,
      from: entry,
      to: toRecord,
      changes: [{ path: "extra.md", status: "removed" as const }],
      riskDelta: { from: record.risk.level, to: record.risk.level },
      scoreDelta: { from: record.scores.total, to: record.scores.total },
    }
    await applyUpdate({ plan, l, fetchImpl: (async () => new Response(nextBytes)) as unknown as typeof fetch, rawBase: "https://raw.test" })

    expect(existsSync(join(l.storeDir, record.id, "extra.md"))).toBe(false)
    expect(readFileSync(join(l.storeDir, record.id, "SKILL.md"), "utf8")).toContain("new")
  })
})

describe("activate / deactivate", () => {
  it("copies into managed/ and toggles the lockfile, then reverses", async () => {
    const { l, record } = await prepared()
    activateSkill(l, record.id)
    expect(readLockfile(l.lockfilePath).skills[record.id]?.active).toBe(true)
    expect(readFileSync(join(l.managedDir, record.id, "good-skill/SKILL.md"), "utf8")).toContain("Good Skill")
    deactivateSkill(l, record.id)
    expect(readLockfile(l.lockfilePath).skills[record.id]?.active).toBe(false)
  })
})
