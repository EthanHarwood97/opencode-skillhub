import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { makeOpenAiCompatClient } from "../src/llm.ts"
import { makeRubricEvaluator } from "../src/rubric.ts"
import { fetchAgentskills } from "../src/sources/agentskills.ts"
import { fetchRepoSkills, searchReposByTopic } from "../src/sources/github.ts"
import type { FetchLike } from "../src/sources/types.ts"
import { syncCatalog } from "../src/sync.ts"

const live = process.env.SKILLHUB_LIVE === "1"
const llmKey = process.env.SKILLHUB_LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY
const llmLive = process.env.SKILLHUB_LIVE_LLM === "1" && Boolean(llmKey)
const fetchImpl = fetch as unknown as FetchLike
const token = process.env.GITHUB_TOKEN

describe.skipIf(!live)("live sources", () => {
  it(
    "ingests real GitHub + agentskills candidates and syncs offline",
    { timeout: 120_000 },
    async () => {
      const hits = await searchReposByTopic({ topic: "claude-skills", fetchImpl, limit: 2, token })
      expect(hits.length).toBeGreaterThan(0)
      const candidates = await fetchRepoSkills({
        repo: hits[0]!.repo,
        ref: hits[0]!.defaultBranch,
        fetchImpl,
        token,
        license: hits[0]!.license,
        maxSkills: 2,
        maxFileBytes: 128_000,
      })
      expect(candidates.length).toBeGreaterThan(0)

      const marketplace = await fetchAgentskills({ baseUrl: "https://agentskills.codes", fetchImpl, limit: 2 })
      expect(marketplace.length).toBeGreaterThan(0)

      const root = mkdtempSync(join(tmpdir(), "skillhub-live-"))
      const result = await syncCatalog({
        sources: [{ name: "live", load: async () => [...candidates, ...marketplace] }],
        outDir: join(root, "catalog"),
        stateDir: join(root, "state"),
      })
      expect(result.index.skills.length).toBeGreaterThan(0)
      expect(result.reconciliation.sources[0]?.source).toBe("live")
    },
  )
})

describe.skipIf(!llmLive)("live rubric", () => {
  it(
    "evaluates one skill within a $0.05 cap",
    { timeout: 120_000 },
    async () => {
      const baseUrl = process.env.SKILLHUB_LLM_BASE_URL ?? "https://api.deepseek.com/v1"
      const model = process.env.SKILLHUB_LLM_MODEL ?? "deepseek-chat"
      const evaluate = makeRubricEvaluator(makeOpenAiCompatClient({ baseUrl, apiKey: llmKey!, model }))
      const out = await evaluate({
        id: "fixture/good-skill",
        name: "good-skill",
        description: "fixture for live rubric smoke",
        body: "---\nname: good-skill\ndescription: d\n---\n\n# Good Skill\n\n## When to use\n\nUse when testing.\n\n## Workflow\n\n1. One.\n\n## Examples\n\n`echo ok`\n",
      })
      expect(out.result.score).toBeGreaterThanOrEqual(0)
      expect(out.result.score).toBeLessThanOrEqual(100)
      expect(out.costUsd).toBeLessThan(0.05)
      console.log(`live rubric: score ${out.result.score}, model ${out.model}, cost $${out.costUsd.toFixed(5)}`)
    },
  )
})
