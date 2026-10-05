import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildCatalog } from "../src/build.ts"
import { loadFixtureCandidates } from "../src/sources/fixtures.ts"
import type { Candidate } from "../src/sources/types.ts"

const fixtures = fileURLToPath(new URL("../../../fixtures/skills", import.meta.url))

describe("buildCatalog", () => {
  it("publishes healthy + quarantine skills and rejects gate failures", () => {
    const out = mkdtempSync(join(tmpdir(), "skillhub-build-"))
    const { summary, index } = buildCatalog({
      candidates: loadFixtureCandidates(fixtures),
      outDir: out,
      now: new Date("2026-10-05T00:00:00Z"),
    })
    expect(summary.published).toBe(2)
    expect(summary.quarantined).toBe(1)
    expect(summary.rejected.map((r) => r.name)).toContain("broken-skill")
    const ids = index.skills.map((s) => s.id)
    expect(ids).toContain("local/good-skill")
    expect(index.skills.find((s) => s.id === "local/risky-skill")?.status).toBe("quarantined")
    expect(readFileSync(join(out, "search.db")).byteLength).toBeGreaterThan(0)
  })

  it("rejects duplicate ids instead of crashing the search DB build", () => {
    const content = readFileSync(join(fixtures, "good-skill", "SKILL.md"), "utf8")
    const dup = (dir: string): Candidate => ({
      source: { kind: "github", repo: "acme/skills", path: `${dir}/SKILL.md`, ref: "abc123", license: "MIT", licenseFlags: [] },
      name: "dup-skill",
      dir,
      tags: ["good"],
      signals: { pushedAt: "2026-09-01T00:00:00Z" },
      files: [{ path: `${dir}/SKILL.md`, content, size: Buffer.byteLength(content) }],
    })
    const out = mkdtempSync(join(tmpdir(), "skillhub-build-dup-"))
    const { summary, index } = buildCatalog({
      candidates: [dup("a"), dup("b")],
      outDir: out,
      now: new Date("2026-10-05T00:00:00Z"),
    })
    expect(summary.published).toBe(1)
    expect(summary.rejected.map((r) => r.reason)).toEqual(["duplicate id acme-skills/dup-skill"])
    expect(index.skills).toHaveLength(1)
    expect(readFileSync(join(out, "search.db")).byteLength).toBeGreaterThan(0)
  })
})
