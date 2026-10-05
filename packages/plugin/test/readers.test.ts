import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { readCatalogIndex, readLock, findRecord } from "../src/catalog-read.ts"

const root = () => mkdtempSync(join(tmpdir(), "skillhub-plugin-"))

const sampleIndex = {
  version: 1,
  generatedAt: "2026-10-05T00:00:00.000Z",
  counts: { total: 1, byStatus: { candidate: 1 }, byCategory: { engineering: 1 } },
  skills: [
    {
      id: "acme/good", name: "good", description: "d", category: "engineering", tags: ["good"],
      clusterId: "engineering/good", clusterLabel: "Good",
      source: { kind: "github", repo: "acme/skills", path: "good/SKILL.md", ref: "abc", licenseFlags: [] },
      files: [], contentHash: "0".repeat(64),
      requires: { runtime: [], scripts: [], mcp: [], env: [], services: [] },
      risk: { level: "low", findings: [] }, signals: {},
      scores: { total: 50, quality: 50, trust: 50, freshness: 50, compatibility: 50, adoption: 50, reasons: [], rubricVersion: "heuristic-v0", evaluatedAt: "2026-10-05T00:00:00.000Z" },
      provenanceTier: "sha-pinned", status: "candidate",
      relations: { supersedes: [], duplicates: [], alternatives: [] },
    },
  ],
}

describe("readers", () => {
  it("returns undefined when no catalog exists", () => {
    expect(readCatalogIndex(root())).toBeUndefined()
  })

  it("reads and finds records", () => {
    const r = root()
    mkdirSync(join(r, "catalog"), { recursive: true })
    writeFileSync(join(r, "catalog", "index.json"), JSON.stringify(sampleIndex))
    const index = readCatalogIndex(r)!
    expect(index.counts.total).toBe(1)
    expect(findRecord(index, "acme/good")?.name).toBe("good")
  })

  it("defaults the lockfile", () => {
    const lock = readLock(root())
    expect(lock).toEqual({ version: 1, skills: {} })
  })
})
