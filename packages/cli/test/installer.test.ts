import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import { normalizeCandidate } from "../../catalog/src/normalize.ts"
import { installSkill } from "../src/installer.ts"
import { layout } from "../src/paths.ts"
import { sha256 } from "../../catalog/src/parse.ts"

const fixtures = fileURLToPath(new URL("../../../fixtures/skills", import.meta.url))

const recordFrom = (name: string) => {
  const content = readFileSync(join(fixtures, name, "SKILL.md"), "utf8")
  return normalizeCandidate(
    {
      source: { kind: "github", repo: "acme/skills", path: `${name}/SKILL.md`, ref: "abc123", license: "MIT", licenseFlags: [] },
      name,
      dir: name,
      tags: [name],
      signals: { pushedAt: "2026-09-01T00:00:00Z" },
      files: [{ path: `${name}/SKILL.md`, content, size: Buffer.byteLength(content) }],
    },
    { now: new Date("2026-10-05T00:00:00Z") },
  ).record!
}

describe("installSkill (github, sha-pinned)", () => {
  it("fetches, verifies, and materializes to the store", async () => {
    const record = recordFrom("good-skill")
    const content = new TextEncoder().encode(readFileSync(join(fixtures, "good-skill", "SKILL.md"), "utf8"))
    const fetchImpl = (async (url: string | URL) => {
      expect(String(url)).toBe("https://raw.example.test/acme/skills/abc123/good-skill/SKILL.md")
      return new Response(content, { status: 200 })
    }) as unknown as typeof fetch
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-install-")))
    const entry = await installSkill({ record, l, fetchImpl, rawBase: "https://raw.example.test", now: new Date("2026-10-05T00:00:00Z") })
    expect(entry.active).toBe(false)
    expect(readFileSync(join(l.storeDir, record.id, "good-skill/SKILL.md"), "utf8")).toContain("Good Skill")
  })

  it("refuses to install when a hash mismatches", async () => {
    const record = recordFrom("good-skill")
    const fetchImpl = (async () => new Response("tampered", { status: 200 })) as unknown as typeof fetch
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-install-")))
    await expect(installSkill({ record, l, fetchImpl, rawBase: "https://raw.example.test" })).rejects.toThrow(/hash mismatch/i)
    expect(() => readdirSync(join(l.storeDir, record.id))).toThrow()
  })

  it("refuses unsafe file paths", async () => {
    const record = recordFrom("good-skill")
    const content = new TextEncoder().encode(readFileSync(join(fixtures, "good-skill", "SKILL.md"), "utf8"))
    const unsafeRecord = {
      ...record,
      files: [{ path: "../escape.md", sha256: sha256(content), size: content.length }],
    }
    const fetchImpl = (async () => new Response(content, { status: 200 })) as unknown as typeof fetch
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-install-")))
    await expect(installSkill({ record: unsafeRecord, l, fetchImpl, rawBase: "https://raw.example.test" })).rejects.toThrow(/unsafe file path/)
    expect(existsSync(join(l.storeDir, "escape.md"))).toBe(false)
    expect(existsSync(join(l.storeDir, "..", "escape.md"))).toBe(false)
    expect(existsSync(join(l.storeDir, record.id, "..", "escape.md"))).toBe(false)
  })
})

describe("installSkill (marketplace, content-hash-pinned)", () => {
  it("reads files out of the downloaded zip", async () => {
    const record = recordFrom("good-skill")
    const skillBytes = new TextEncoder().encode(readFileSync(join(fixtures, "good-skill", "SKILL.md"), "utf8"))
    const marketplaceRecord = {
      ...record,
      provenanceTier: "content-hash-pinned" as const,
      source: { kind: "marketplace" as const, path: "SKILL.md", url: "https://mp.example.test/download/7", licenseFlags: ["unknown-license"] },
      files: [{ path: "SKILL.md", sha256: sha256(skillBytes), size: skillBytes.length }],
    }
    const zip = zipSync({ "SKILL.md": skillBytes })
    const fetchImpl = (async () => new Response(zip, { status: 200 })) as unknown as typeof fetch
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-install-")))
    const entry = await installSkill({ record: marketplaceRecord, l, fetchImpl })
    expect(entry.provenanceTier).toBe("content-hash-pinned")
    expect(readFileSync(join(l.storeDir, record.id, "SKILL.md"), "utf8")).toContain("Good Skill")
  })
})
