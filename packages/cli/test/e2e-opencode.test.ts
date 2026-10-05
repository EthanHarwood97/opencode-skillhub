import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { zipSync } from "fflate"
import { afterAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { normalizeCandidate } from "../../catalog/src/normalize.ts"
import { activateSkill } from "../src/write-helpers.ts"
import { installSkill } from "../src/installer.ts"
import { readLockfile, upsertEntry, writeLockfile } from "../src/lockfile.ts"
import { layout } from "../src/paths.ts"
import { resolveOpencodeBin, sandboxEnv } from "./support/opencode.ts"

const bin = resolveOpencodeBin()
const fixtures = fileURLToPath(new URL("../../../fixtures/skills", import.meta.url))
const servers: ReturnType<typeof createServer>[] = []
afterAll(() => servers.forEach((s) => s.close()))

describe("E2E: installed skill is visible to opencode (sandboxed)", () => {
  it.skipIf(!bin)("resolves a managed skill via opencode debug skill and leaks no real skills", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-e2e-"))
    const home = join(root, "home")
    mkdirSync(home, { recursive: true })
    spawnSync("git", ["init", "-q", root])

    const content = readFileSync(join(fixtures, "good-skill", "SKILL.md"), "utf8")
    const candidate = normalizeCandidate(
      {
        source: { kind: "marketplace", path: "SKILL.md", url: "http://127.0.0.1:0/pending", licenseFlags: ["unknown-license"] },
        name: "good-skill",
        dir: "good-skill",
        tags: ["good"],
        signals: { pushedAt: "2026-09-01T00:00:00Z" },
        files: [{ path: "SKILL.md", content, size: Buffer.byteLength(content) }],
      },
      { now: new Date("2026-10-05T00:00:00Z") },
    ).record!

    const server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/zip" })
      res.end(Buffer.from(zipSync({ "good-skill/SKILL.md": new TextEncoder().encode(content) })))
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const port = (server.address() as { port: number }).port
    const record = { ...candidate, source: { ...candidate.source, url: `http://127.0.0.1:${port}/skill.zip` } }

    const l = layout(root)
    const entry = await installSkill({ record, l })
    writeLockfile(l.lockfilePath, upsertEntry(readLockfile(l.lockfilePath), entry))
    activateSkill(l, record.id)

    const project = join(root, "project")
    mkdirSync(project, { recursive: true })
    writeFileSync(
      join(project, "opencode.json"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json", skills: { paths: [l.managedDir.replace(/\\/g, "/")] } }),
    )

    const result = spawnSync(bin!, ["debug", "skill"], { cwd: project, env: sandboxEnv(home), encoding: "utf8" })
    expect(result.status).toBe(0)
    const skills = JSON.parse(result.stdout) as { name: string; location: string }[]
    const names = skills.map((s) => s.name)
    expect(names).toContain("good-skill")
    expect(names).not.toContain("wowfactor-web")
    expect(names).not.toContain("visual-critique")
  }, 60_000)
})
