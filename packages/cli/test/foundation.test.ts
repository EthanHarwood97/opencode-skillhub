import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ensureDirs, layout, resolveHome } from "../src/paths.ts"
import { readLockfile, upsertEntry, writeLockfile } from "../src/lockfile.ts"

const tmp = () => mkdtempSync(join(tmpdir(), "skillhub-foundation-"))

describe("paths", () => {
  it("derives the full layout from a root", () => {
    const l = layout("C:/tmp/root")
    expect(l.catalogDir).toBe(join("C:/tmp/root", "catalog"))
    expect(l.storeDir).toBe(join("C:/tmp/root", "store"))
    expect(l.managedDir).toBe(join("C:/tmp/root", "managed"))
  })

  it("respects SKILLHUB_HOME", () => {
    expect(resolveHome({ SKILLHUB_HOME: "C:/custom" } as NodeJS.ProcessEnv)).toBe("C:/custom")
  })

  it("creates all directories", () => {
    const l = layout(tmp())
    ensureDirs(l)
    expect(existsSync(l.catalogDir) && existsSync(l.storeDir) && existsSync(l.managedDir)).toBe(true)
  })
})

describe("lockfile", () => {
  it("defaults to empty and round-trips sorted", () => {
    const l = layout(tmp())
    writeFileSync(l.lockfilePath, JSON.stringify(readLockfile(l.lockfilePath)))
    const entry = {
      id: "acme/demo",
      contentHash: "0".repeat(64),
      provenanceTier: "sha-pinned" as const,
      installedAt: "2026-10-05T00:00:00.000Z",
      files: [{ path: "SKILL.md", sha256: "0".repeat(64), size: 10 }],
      active: false,
      riskLevel: "low",
      total: 50,
    }
    const lock = upsertEntry(upsertEntry({ version: 1, skills: {} }, entry), { ...entry, id: "acme/aaa" })
    writeLockfile(l.lockfilePath, lock)
    const raw = JSON.parse(readFileSync(l.lockfilePath, "utf8"))
    expect(Object.keys(raw.skills)).toEqual(["acme/aaa", "acme/demo"])
  })
})
