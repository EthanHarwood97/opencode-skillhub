import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { buildCatalog } from "../../catalog/src/build.ts"
import { loadFixtureCandidates } from "../../catalog/src/sources/fixtures.ts"
import { sha256 } from "../../catalog/src/parse.ts"
import type { SkillRecord } from "../../catalog/src/types.ts"
import { installSkill } from "../src/installer.ts"
import { readLockfile, upsertEntry, writeLockfile } from "../src/lockfile.ts"
import { layout } from "../src/paths.ts"

const binPath = fileURLToPath(new URL("../src/bin.ts", import.meta.url))
const fixtures = fileURLToPath(new URL("../../../fixtures/skills", import.meta.url))
const servers: ReturnType<typeof createServer>[] = []
afterAll(() => servers.forEach((s) => s.close()))

const serveBytes = async (bytes: Uint8Array): Promise<string> => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" })
    res.end(Buffer.from(bytes))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as { port: number }
  return `http://127.0.0.1:${port}`
}

const setupStore = async () => {
  const root = mkdtempSync(join(tmpdir(), "skillhub-cli-"))
  const l = layout(root)
  const built = buildCatalog({
    candidates: loadFixtureCandidates(fixtures),
    outDir: l.catalogDir,
    now: new Date("2026-10-05T00:00:00Z"),
  })
  const local = built.index.skills.find((s) => s.name === "good-skill")!
  const record: SkillRecord = {
    ...local,
    source: { kind: "github", repo: "acme/skills", path: "good-skill/SKILL.md", ref: "abc123", license: "MIT", licenseFlags: [] },
  }
  const bytes = new Uint8Array(readFileSync(join(fixtures, "good-skill", "SKILL.md")))
  const entry = await installSkill({
    record,
    l,
    fetchImpl: (async () => new Response(bytes)) as unknown as typeof fetch,
    rawBase: "https://raw.test",
    now: new Date("2026-10-05T00:00:00Z"),
  })
  writeLockfile(l.lockfilePath, upsertEntry(readLockfile(l.lockfilePath), entry))

  const writeIndex = (skills: SkillRecord[]) =>
    writeFileSync(join(l.catalogDir, "index.json"), JSON.stringify({ ...built.index, skills }, null, 2) + "\n")
  const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [binPath, ...args], { env: { ...process.env, SKILLHUB_HOME: root, ...env } })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (chunk) => (stdout += chunk))
      child.stderr.on("data", (chunk) => (stderr += chunk))
      child.on("close", (status) => resolve({ status, stdout, stderr }))
    })
  return { root, l, record, bytes, writeIndex, run }
}

describe("cli review/update JSON contract", () => {
  it("review --json emits one valid up-to-date object", async () => {
    const { record, writeIndex, run } = await setupStore()
    writeIndex([record])
    const result = await run(["review", record.id, "--json"])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ id: record.id, status: "up-to-date" })
  })

  it("review --json emits not-installed for an unknown id", async () => {
    const { record, writeIndex, run } = await setupStore()
    writeIndex([record])
    const result = await run(["review", "ghost/skill", "--json"])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ id: "ghost/skill", status: "not-installed" })
  })

  it("update --json emits not-installed for an unknown id", async () => {
    const { record, writeIndex, run } = await setupStore()
    writeIndex([record])
    const result = await run(["update", "ghost/skill", "--json"])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual([{ id: "ghost/skill", status: "not-installed" }])
  })

  it("review prints and serializes the authoritative patch", async () => {
    const { record, bytes, writeIndex, run } = await setupStore()
    const nextBytes = new TextEncoder().encode(new TextDecoder().decode(bytes).replace("Read the input.", "Read the input twice."))
    const rawBase = await serveBytes(nextBytes)
    const updated: SkillRecord = {
      ...record,
      contentHash: "d".repeat(64),
      files: [{ path: "good-skill/SKILL.md", sha256: sha256(nextBytes), size: nextBytes.byteLength }],
    }
    writeIndex([updated])

    const human = await run(["review", record.id], { SKILLHUB_RAW_BASE: rawBase })
    expect(human.status, human.stderr).toBe(0)
    expect(human.stdout).toContain("modified good-skill/SKILL.md")
    expect(human.stdout).toMatch(/--- good-skill\/SKILL\.md/)
    expect(human.stdout).toContain("+1. Read the input twice.")

    const json = await run(["review", record.id, "--json"], { SKILLHUB_RAW_BASE: rawBase })
    expect(json.status, json.stderr).toBe(0)
    const parsed = JSON.parse(json.stdout) as { status: string; changes: { path: string; status: string; patch?: string }[] }
    expect(parsed.status).toBe("update-available")
    expect(parsed.changes[0]?.status).toBe("modified")
    expect(parsed.changes[0]?.patch).toContain("Read the input twice.")
  })

  it("update --apply refuses a quarantined target and leaves store and lockfile untouched", async () => {
    const { l, record, bytes, writeIndex, run } = await setupStore()
    const nextBytes = new TextEncoder().encode(new TextDecoder().decode(bytes).replace("Read the input.", "HOSTILE replacement."))
    const rawBase = await serveBytes(nextBytes)
    const quarantined: SkillRecord = {
      ...record,
      contentHash: "f".repeat(64),
      files: [{ path: "good-skill/SKILL.md", sha256: sha256(nextBytes), size: nextBytes.byteLength }],
      status: "quarantined",
      risk: {
        level: "critical",
        findings: [{ rule: "injection.ignore-previous", category: "injection", severity: "critical", match: "ignore all previous instructions", line: 3 }],
      },
    }
    writeIndex([quarantined])
    const storePath = join(l.storeDir, record.id, "good-skill/SKILL.md")
    const before = new Uint8Array(readFileSync(storePath))
    const lockBefore = readFileSync(l.lockfilePath, "utf8")

    const human = await run(["update", record.id, "--apply"], { SKILLHUB_RAW_BASE: rawBase })
    expect(human.status, human.stderr).toBe(0)
    expect(human.stdout).toContain("blocked (status quarantined; findings: injection.ignore-previous)")

    const json = await run(["update", record.id, "--apply", "--json"], { SKILLHUB_RAW_BASE: rawBase })
    expect(json.status, json.stderr).toBe(0)
    const parsed = JSON.parse(json.stdout) as { id: string; status: string; riskLevel?: string; findings?: string[] }[]
    expect(parsed[0]?.status).toBe("blocked")
    expect(parsed[0]?.riskLevel).toBe("critical")
    expect(parsed[0]?.findings).toEqual(["injection.ignore-previous"])

    expect(new Uint8Array(readFileSync(storePath))).toEqual(before)
    expect(readFileSync(l.lockfilePath, "utf8")).toBe(lockBefore)
  })
})
