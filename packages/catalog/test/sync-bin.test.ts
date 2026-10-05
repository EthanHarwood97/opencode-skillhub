import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const bin = "packages/catalog/src/sync-bin.ts"

const run = (args: string[], env: NodeJS.ProcessEnv = process.env) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", env })

describe("sync-bin guard rails", () => {
  it("refuses --llm without a hard cost cap", () => {
    const result = run(["--fixtures", "fixtures/skills", "--llm"])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("--max-usd")
  })

  it("refuses --llm without an API key", () => {
    const env = { ...process.env }
    delete env.SKILLHUB_LLM_API_KEY
    delete env.DEEPSEEK_API_KEY
    const result = run(["--fixtures", "fixtures/skills", "--llm", "--max-usd", "1"], env)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("API_KEY")
  })

  it("writes no vector artifacts with --no-vectors", () => {
    const out = mkdtempSync(join(tmpdir(), "skillhub-sync-bin-vec-"))
    const result = run(["--fixtures", "fixtures/skills", "--no-vectors", "--out", out, "--state", join(out, "state")])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("vectors: disabled by --no-vectors")
    expect(existsSync(join(out, "index.json"))).toBe(true)
    expect(existsSync(join(out, "vectors.json"))).toBe(false)
    expect(existsSync(join(out, "vectors.bin"))).toBe(false)
  })
})
