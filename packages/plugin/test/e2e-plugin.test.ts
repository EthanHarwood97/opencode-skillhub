import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildCatalog } from "../../catalog/src/build.ts"
import { normalizeCandidate } from "../../catalog/src/normalize.ts"
import { installSkill } from "../../cli/src/installer.ts"
import { activateSkill } from "../../cli/src/activate.ts"
import { importCatalog } from "../../cli/src/catalog-cache.ts"
import { readLockfile, upsertEntry, writeLockfile } from "../../cli/src/lockfile.ts"
import { layout } from "../../cli/src/paths.ts"
import { resolveOpencodeBin, sandboxEnv } from "../../cli/test/support/opencode.ts"
import { estimateTokens, ROUTER_DESCRIPTION } from "../src/search-core.ts"

const bin = resolveOpencodeBin()
const pluginPath = fileURLToPath(new URL("../src/plugin.ts", import.meta.url))
const fixtures = fileURLToPath(new URL("../../../fixtures/skills", import.meta.url))
const live = process.env.SKILLHUB_LIVE === "1"

function setupSandbox() {
  const root = mkdtempSync(join(tmpdir(), "skillhub-p2e2e-"))
  const home = join(root, "home")
  mkdirSync(home, { recursive: true })
  spawnSync("git", ["init", "-q", root])

  const sbRoot = join(home, ".config", "opencode", ".skillhub")
  const l = layout(sbRoot)
  const content = readFileSync(join(fixtures, "good-skill", "SKILL.md"), "utf8")
  const candidate = {
    source: { kind: "github" as const, repo: "acme/skills", path: "good-skill/SKILL.md", ref: "abc123", license: "MIT", licenseFlags: [] },
    name: "good-skill", dir: "good-skill", tags: ["good"], signals: { pushedAt: "2026-09-01T00:00:00Z" },
    files: [{ path: "good-skill/SKILL.md", content, size: Buffer.byteLength(content) }],
  }
  const built = join(root, "built")
  buildCatalog({ candidates: [candidate], outDir: built, now: new Date("2026-10-05T00:00:00Z") })
  importCatalog(built, l)

  const record = normalizeCandidate(candidate, { now: new Date("2026-10-05T00:00:00Z") }).record!

  const project = join(root, "project")
  mkdirSync(project, { recursive: true })
  writeFileSync(join(project, "opencode.json"), JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin: [pluginPath.replace(/\\/g, "/")] }))
  return { root, home, l, record, project }
}

async function installAndActivate(sb: ReturnType<typeof setupSandbox>) {
  const bytes = new Uint8Array(readFileSync(join(fixtures, "good-skill", "SKILL.md")))
  const entry = await installSkill({
    record: sb.record,
    l: sb.l,
    fetchImpl: (async () => new Response(bytes)) as unknown as typeof fetch,
  })
  writeLockfile(sb.l.lockfilePath, upsertEntry(readLockfile(sb.l.lockfilePath), entry))
  activateSkill(sb.l, sb.record.id)
}

const runOpencode = (sb: ReturnType<typeof setupSandbox>, args: string[], extraEnv: NodeJS.ProcessEnv = {}) =>
  spawnSync(bin!, args, { cwd: sb.project, env: { ...sandboxEnv(sb.home), SKILLHUB_HOME: sb.l.root, ...extraEnv }, encoding: "utf8", timeout: 120_000 })

describe("E2E: plugin loads in opencode (sandboxed)", () => {
  it.skipIf(!bin)("config hook injects the managed dir; no real-profile leakage", async () => {
    const sb = setupSandbox()
    await installAndActivate(sb)
    const result = runOpencode(sb, ["debug", "skill"])
    expect(result.status).toBe(0)
    const names = (JSON.parse(result.stdout) as { name: string }[]).map((s) => s.name)
    expect(names).toContain("good-skill")
    expect(names).not.toContain("wowfactor-web")
    expect(names).not.toContain("visual-critique")
  }, 60_000)

  it.skipIf(!bin || !live)("budget: L0 + L1 ≤ 1000 est. tokens; /skills renders status", async () => {
    const sb = setupSandbox()
    await installAndActivate(sb)
    const capture = join(sb.root, "capture")
    const result = runOpencode(sb, ["run", "--command", "skills", "-m", "deepseek/deepseek-flash", "Print the SkillHub status block in this message verbatim. Output only that block and nothing else."], { SKILLHUB_CAPTURE_DIR: capture })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("SkillHub — active")
    const system = JSON.parse(readFileSync(join(capture, "system.json"), "utf8")) as string[]
    const joined = system.join("\n")
    const start = joined.indexOf("<available_skills>")
    const end = joined.indexOf("</available_skills>")
    const block = start >= 0 ? joined.slice(start, end + 21) : ""
    expect(estimateTokens(block) + estimateTokens(ROUTER_DESCRIPTION)).toBeLessThanOrEqual(1000)
  }, 180_000)

  it.skipIf(!bin || !live)("discover→load in ≤2 skillhub tool calls", async () => {
    const sb = setupSandbox()
    await installAndActivate(sb)
    const capture = join(sb.root, "capture")
    const result = runOpencode(
      sb,
      ["run", "-m", "deepseek/deepseek-flash", "Call skillhub_search exactly once with the query \"well-formed skill\". Then call skillhub_load once with the exact id returned by that search. Do not call skillhub_search again. After skillhub_load returns, reply with the skill id only."],
      { SKILLHUB_CAPTURE_DIR: capture },
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("acme-skills/good-skill")
    const callsFile = join(capture, "tool-calls.jsonl")
    const calls = existsSync(callsFile)
      ? readFileSync(callsFile, "utf8").trim().split("\n").map((l) => JSON.parse(l).tool as string).filter((t) => t.startsWith("skillhub_"))
      : []
    expect(calls.slice(0, 2)).toEqual(["skillhub_search", "skillhub_load"])
  }, 240_000)
})
