# SkillHub Phase 3 Implementation Plan (Ranking Depth + Live Catalog)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the spec §12 Phase 3 deliverables — LLM quality rubric with delta-only caching and hard cost caps, golden-set calibration, embedding-based clustering with stable cluster IDs and near-duplicate linking, requirements extraction, star-snapshot trending, reconciliation/review-queue artifacts, and live GitHub + agentskills source wiring behind a `catalog:sync` orchestrator — so the catalog stops being fixture-fed while CI stays network-free.

**Architecture:** All Phase 3 logic lands in `packages/catalog` (Node, deterministic, injected I/O). The LLM is reached through a tiny OpenAI-compatible `fetch` client (no SDK, no new runtime deps); evaluation is injected into the sync pipeline and cached by `contentHash:rubricVersion`, with `--max-usd` + `--max-evals` hard caps and `--llm` opt-in. Embeddings are a local deterministic hashing embedder (zero network, zero deps) behind an `Embedder` interface so a semantic API embedder can be swapped in later. The plugin and search consumers need no changes: the `search.db` schema change is additive columns and all existing `SELECT`s list columns explicitly.

**Tech Stack:** Node ≥ 22.23 (native TS, `node:sqlite` FTS5), zod, gray-matter, Vitest 4, built-in `fetch`, fflate (existing). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-skillhub-design.md` — read §6 (pipeline), §7 (ranking + calibration), §8 (taxonomy/clusters/requirements), §9.1 (budget), §12 Phase 3, §13 SC4/SC7.
**Phase 0 probe report:** `docs/superpowers/probes/2026-10-05-phase0-probes.md` — §6 (rubric cost model), §7 (sandbox containment).

## Global Constraints

Copied from the spec and prior phase plans; every task's requirements implicitly include these.

- **Runtime:** Node ≥ 22.23, `"type": "module"`, relative TS imports end in `.ts`, zero new runtime dependencies (LLM via built-in `fetch`; embeddings local). `node:sqlite` FTS5 is the only SQLite in catalog/CLI code; never import `bun:sqlite` outside the plugin runtime binding.
- **No network in unit tests.** Every adapter takes an injected `fetchImpl`; every LLM call takes an injected `LlmClient`/evaluator. Live network runs are gated behind `SKILLHUB_LIVE=1`; live LLM runs additionally behind `SKILLHUB_LIVE_LLM=1` plus an API key.
- **Cost gate:** `catalog:sync --llm` refuses to run without `--max-usd <n>`; evaluation stops on either `--max-evals` or `--max-usd` and the summary reports spend. Default is no LLM (`--no-llm` behavior is the default).
- **Never rewrite upstream skill content.** Sync fetches raw bytes at a pinned revision and only derives data beside them.
- **Determinism:** builds accept an injected `now`; k-means takes a seed; snapshots key on dates; artifact writers sort records/keys so diffs are reviewable. No wall-clock or RNG without injection in unit-tested paths.
- **Additive schema only:** `search.db` gains columns; existing CLI (`packages/cli/src/search.ts`) and plugin (`packages/plugin/src/search-runtime.ts`) queries select explicit columns and must keep working unmodified.
- **Sandbox rules (Phase 0 §7):** every test process uses a temp `--root`/`SKILLHUB_HOME`; live tests never read the real profile.
- **Commit style:** conventional commits, one commit per task step that says "Commit"; all work happens in the `phase3-ranking` worktree.
- **Acceptance targets:** SC4 — calibration must beat the default weights on the golden set (provisional target ρ ≥ 0.7 on the bootstrap set; the real target is fixed after the user labeling session, which remains an operational step — see Task 10). SC7 — steady-state eval stays delta-only and capped; CI remains $0.

## Rulings applied during execution

These controller rulings supersede the code blocks in the tasks where they apply.

- Skill-relative requirements (Task 1): body-referenced scripts are compared against bundled files in skill-relative POSIX space (`candidate.dir/` stripped from both sides; backslashes normalized).
- Inclusive-linspace sampler + tier-union predicate (Task 4): `sampleForLabeling` uses inclusive linspace indices, and `rankAgreement` accepts only tiers `1|2|3|4`.
- Unsigned 1024-dim embeddings + multi-restart kmeans (Task 5): embedding accumulation is unsigned hashing at 1024 dims, and `kmeans` runs a deterministic multi-restart (lowest inertia, first-seen tie-break).
- Re-dated `selectBaseline` fixtures (Task 6): fixture snapshot dates were re-dated so the documented "newest snapshot at least N days old" semantics hold with the original expectations.
- Sync-test `repo:` frontmatter + explicit error fields for strip-only mode (Task 9): byte-identical fixture bodies gained a `repo:` frontmatter line, and classes were rewritten with explicit `readonly` fields (no parameter properties).
- Signals propagation + marketplace maintenance exemption (Task 10): per-repo signals flow from topic search into candidates, and repo-less marketplace entries are exempt from the maintenance clock.

## File Structure

```
packages/catalog/
├─ src/
│  ├─ requires.ts            # NEW: requirements extraction from SKILL.md body + file list
│  ├─ llm.ts                 # NEW: OpenAI-compatible fetch client + cost math
│  ├─ rubric.ts              # NEW: rubric prompt, zod schema, evaluator factory
│  ├─ eval-cache.ts          # NEW: contentHash:rubricVersion cache read/write
│  ├─ evaluate.ts            # NEW: budgeted delta-only evaluation over records
│  ├─ calibrate.ts           # NEW: golden-set schema, Spearman, weight grid search
│  ├─ label.ts               # NEW: labeling worksheet sample/export/parse
│  ├─ embed.ts               # NEW: deterministic hashing embedder + cosine
│  ├─ cluster-refine.ts      # NEW: k-means, stable IDs, duplicate linking, state IO
│  ├─ trending.ts            # NEW: snapshots, velocity, new-this-month
│  ├─ reconcile.ts           # NEW: index diff, source stats, gaps, review queue
│  ├─ taxonomy.ts            # NEW: canonical category mapping
│  ├─ sync.ts                # NEW: source → normalize → evaluate → cluster → trending → reconcile → publish
│  ├─ sync-bin.ts            # NEW: `npm run catalog:sync` CLI
│  ├─ sources/util.ts        # NEW: mapLimit + RateLimitError
│  ├─ sources/types.ts       # MODIFY: FetchLike gains optional headers; CandidateFile stays
│  ├─ sources/github.ts      # MODIFY: pagination, default branch, rate-limit detection, concurrency, caps
│  ├─ sources/agentskills.ts # MODIFY: category mapping
│  ├─ build.ts               # MODIFY: extract normalizeAll (bodies map) for sync reuse
│  ├─ publish.ts             # MODIFY: optional trending/reconciliation artifacts; search.db columns
│  ├─ score.ts               # MODIFY: missingScripts penalty; rescoreWithQuality
│  └─ normalize.ts           # MODIFY: extractRequires wiring + body in result
│  └─ test/*.test.ts         # new + extended tests
packages/cli/
├─ src/commands/depth.ts     # NEW: calibrate + label + trending/clusters formatters
└─ src/bin.ts                # MODIFY: calibrate / label / trending / clusters commands
package.json                 # MODIFY: catalog:sync script
docs/superpowers/specs/2026-10-05-skillhub-design.md  # MODIFY: Phase 3 status + calibration target
```

---

### Task 1: Requirements extraction (+ compatibility wiring)

**Files:**
- Create: `packages/catalog/src/requires.ts`
- Modify: `packages/catalog/src/normalize.ts`
- Modify: `packages/catalog/src/score.ts`
- Test: `packages/catalog/test/requires.test.ts`, `packages/catalog/test/normalize.test.ts` (add cases), `packages/catalog/test/score.test.ts` (add case)

**Interfaces:**
- Consumes: `Requires` from `types.ts`.
- Produces:
  - `extractRequires(input: { body: string; files: string[] }): Requires` — sorted, deduped arrays of `runtime`, `scripts`, `mcp`, `env`, `services`.
  - `normalizeCandidate` result gains `body?: string` (`NormalizeResult = { record?: SkillRecord; rejected?: { reason: string }; body?: string }`) and `record.requires` is populated.
  - `ScoreInput` gains `missingScripts?: number`; compatibility = `100 - missing*25 - missingScripts*10`.

- [ ] **Step 1: Write the failing requires tests**

`packages/catalog/test/requires.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { extractRequires } from "../src/requires.ts"

describe("extractRequires", () => {
  it("extracts runtimes, scripts, env, mcp, services", () => {
    const body = [
      "# X",
      "Run `python scripts/tool.py --flag` then `npx some-cli`.",
      "Set `OPENAI_API_KEY=...` and `GITHUB_TOKEN`.",
      "Uses the mcp__github server and the Figma API.",
    ].join("\n")
    const r = extractRequires({ body, files: ["SKILL.md", "scripts/tool.py", "run.ps1"] })
    expect(r.runtime).toEqual(["node", "python"])
    expect(r.scripts).toEqual(["run.ps1", "scripts/tool.py"])
    expect(r.env).toEqual(["GITHUB_TOKEN", "OPENAI_API_KEY"])
    expect(r.mcp).toEqual(["github"])
    expect(r.services).toEqual(["figma"])
  })

  it("records body-referenced scripts that are not bundled", () => {
    const r = extractRequires({ body: "Then run `python scripts/missing.py`.", files: ["SKILL.md"] })
    expect(r.scripts).toEqual(["scripts/missing.py"])
  })

  it("returns empty arrays for a plain doc", () => {
    const r = extractRequires({ body: "# T\n\nJust prose about writing.\n", files: ["SKILL.md"] })
    expect(r).toEqual({ runtime: [], scripts: [], mcp: [], env: [], services: [] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/requires.test.ts`
Expected: FAIL — cannot resolve `../src/requires.ts`.

- [ ] **Step 3: Write requires.ts**

`packages/catalog/src/requires.ts`:

```ts
import type { Requires } from "./types.ts"

const RUNTIME_PATTERNS: [string, RegExp][] = [
  ["node", /\b(npx|npm|pnpm|yarn|node)\s+[A-Za-z0-9@./_-]/],
  ["bun", /\bbun\s+(run|x|install|add)\b/],
  ["deno", /\bdeno\s+(run|task|eval)\b/],
  ["python", /\b(python3?|pip3?|uv)\s+[A-Za-z0-9./_-]/],
  ["powershell", /\b(pwsh|powershell)\b/i],
]

const SCRIPT_EXTENSIONS = new Set([
  ".sh", ".bash", ".ps1", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".bat", ".cmd", ".rb", ".go", ".rs", ".pl",
])

const SCRIPT_REF_RE = /[`"'\s]([\w./-]+\.(?:sh|bash|ps1|py|js|mjs|cjs|ts|tsx|bat|cmd|rb|go|rs|pl))\b/g
const ENV_RE = /\b([A-Z][A-Z0-9_]*_(?:KEY|TOKEN|SECRET|URL|ID|PATH|ENDPOINT))\b/g
const MCP_RE = /mcp__([a-z0-9_-]+)|\bMCP server[s]?\s+["'`]?([a-z0-9_-]+)/gi

export const KNOWN_SERVICES = [
  "github", "gitlab", "figma", "notion", "slack", "discord", "stripe", "supabase", "cloudflare",
  "vercel", "netlify", "aws", "azure", "gcp", "openai", "anthropic", "deepseek", "google",
  "linear", "jira", "airtable", "hubspot", "shopify", "youtube", "spotify", "twitter",
]

/** Extract what a skill needs: runtimes invoked, scripts referenced, MCP servers, env vars, services. */
export function extractRequires(input: { body: string; files: string[] }): Requires {
  const runtime = new Set<string>()
  for (const [name, re] of RUNTIME_PATTERNS) if (re.test(input.body)) runtime.add(name)

  const scripts = new Set<string>()
  for (const path of input.files) {
    if (path.endsWith("SKILL.md")) continue
    const dot = path.lastIndexOf(".")
    if (dot !== -1 && SCRIPT_EXTENSIONS.has(path.slice(dot).toLowerCase())) scripts.add(path)
  }
  for (const match of input.body.matchAll(SCRIPT_REF_RE)) if (match[1]) scripts.add(match[1])

  const env = new Set<string>()
  for (const match of input.body.matchAll(ENV_RE)) if (match[1]) env.add(match[1])

  const mcp = new Set<string>()
  for (const match of input.body.matchAll(MCP_RE)) {
    const name = match[1] ?? match[2]
    if (name) mcp.add(name.toLowerCase())
  }

  const services = new Set<string>()
  const lower = input.body.toLowerCase()
  for (const service of KNOWN_SERVICES) if (new RegExp(`\\b${service}\\b`).test(lower)) services.add(service)

  const sorted = (set: Set<string>) => [...set].sort()
  return { runtime: sorted(runtime), scripts: sorted(scripts), mcp: sorted(mcp), env: sorted(env), services: sorted(services) }
}
```

- [ ] **Step 4: Run requires tests to verify they pass**

Run: `npx vitest run packages/catalog/test/requires.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Wire into normalize + score (write failing cases first)**

Append to `packages/catalog/test/normalize.test.ts`:

```ts
  it("extracts requirements and body in the normalize result", () => {
    const withRequires = candidate("good-skill")
    const skillFile = withRequires.files[0]!
    skillFile.content = `${skillFile.content}\n\nRun \`python scripts/missing.py\` with \`OPENAI_API_KEY\`.\n`
    skillFile.bytes = new TextEncoder().encode(skillFile.content)
    const { record, body } = normalizeCandidate(withRequires, { now })
    expect(record?.requires.runtime).toEqual(["python"])
    expect(record?.requires.scripts).toEqual(["scripts/missing.py"])
    expect(record?.requires.env).toEqual(["OPENAI_API_KEY"])
    expect(record?.scores.compatibility).toBeLessThan(100)
    expect(body).toContain("# Good Skill")
  })
```

Append to `packages/catalog/test/score.test.ts`:

```ts
  it("penalizes required scripts that are not bundled", () => {
    const missing = scoreRecord({ ...healthy, missingScripts: 2 })
    expect(missing.compatibility).toBeLessThan(scoreRecord(healthy).compatibility)
  })
```

Run: `npx vitest run packages/catalog/test/normalize.test.ts packages/catalog/test/score.test.ts`
Expected: FAIL — `requires.scripts` empty / `compatibility` unchanged.

- [ ] **Step 6: Implement normalize + score changes**

In `packages/catalog/src/normalize.ts`:
- import `extractRequires` from `./requires.ts`
- change `NormalizeResult` to `{ record?: SkillRecord; rejected?: { reason: string }; body?: string }`
- after the gate/missing checks (just before `scoreRecord`), add:

```ts
  const requires = extractRequires({ body: parsed.body, files: candidate.files.map((f) => f.path) })
  const presentPaths = new Set(candidate.files.map((f) => f.path))
  const missingScripts = requires.scripts.filter((s) => !presentPaths.has(s)).length
```

- pass `missingScripts` into `scoreRecord({ ... })` (add the field) and set `requires` in the record (replace the empty literal).
- return `{ record, body: parsed.body }` at the end.

In `packages/catalog/src/score.ts`:
- add `missingScripts?: number` to `ScoreInput`
- replace the compatibility block:

```ts
  const missing = filesPresent.filter((p) => !p).length
  const missingScripts = input.missingScripts ?? 0
  const compatibility = clamp(100 - missing * 25 - missingScripts * 10)
  if (missingScripts > 0) {
    reasons.push(`compatibility: ${missingScripts} required script(s) not bundled (-${missingScripts * 10})`)
  } else {
    reasons.push(missing ? `compatibility: ${missing} missing file(s) (-${missing * 25})` : "compatibility: all files present (100)")
  }
```

- [ ] **Step 7: Run the catalog tests to verify they pass**

Run: `npx vitest run packages/catalog/test`
Expected: all pass (existing normalize/score/build suites unchanged).

- [ ] **Step 8: Commit**

```bash
git add packages/catalog/src/requires.ts packages/catalog/src/normalize.ts packages/catalog/src/score.ts packages/catalog/test
git commit -m "feat(catalog): requirements extraction and compatibility scoring wiring"
```

---

### Task 2: LLM client + rubric evaluator

**Files:**
- Create: `packages/catalog/src/llm.ts`, `packages/catalog/src/rubric.ts`
- Test: `packages/catalog/test/llm.test.ts`, `packages/catalog/test/rubric.test.ts`

**Interfaces:**
- Produces:
  - `type ChatMessage = { role: "system" | "user"; content: string }`
  - `type LlmUsage = { inputTokens: number; outputTokens: number }`
  - `type LlmResult = { text: string; usage: LlmUsage; model: string }`
  - `type LlmClient = { complete: (messages: ChatMessage[]) => Promise<LlmResult> }`
  - `class LlmError extends Error { status?: number }`
  - `makeOpenAiCompatClient(opts: { baseUrl: string; apiKey: string; model: string; fetchImpl?: typeof fetch; temperature?: number }): LlmClient` — POSTs `${baseUrl}/chat/completions`, retries once on 429/5xx, throws on other statuses/empty content.
  - `estimateCostUsd(usage: LlmUsage, pricing?): number`, `DEFAULT_PRICING = { inputPerMTok: 0.3, outputPerMTok: 1.0 }`
  - `RUBRIC_VERSION = "rubric-v1"`, `RUBRIC_DIMENSIONS`, `RubricResultSchema`, `type RubricResult`
  - `buildRubricMessages(input: { id: string; name: string; description: string; body: string }): ChatMessage[]` (body capped at `MAX_BODY_CHARS = 24_000`)
  - `parseRubricResponse(text: string): RubricResult` (strips markdown fences)
  - `makeRubricEvaluator(client: LlmClient, pricing?): (input) => Promise<{ result: RubricResult; usage: LlmUsage; costUsd: number; model: string }>`

- [ ] **Step 1: Write the failing llm tests**

`packages/catalog/test/llm.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { estimateCostUsd, LlmError, makeOpenAiCompatClient } from "../src/llm.ts"

const completion = (text: string, input = 100, output = 20, model = "test-model") =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: input, completion_tokens: output }, model }), { status: 200 })

describe("makeOpenAiCompatClient", () => {
  it("posts chat completions and returns text, usage, model", async () => {
    let seenUrl = ""
    let seenAuth = ""
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      seenUrl = String(url)
      seenAuth = String((init?.headers as Record<string, string>)?.authorization ?? "")
      return completion('{"ok":true}', 120, 30, "deepseek-chat")
    }) as unknown as typeof fetch
    const client = makeOpenAiCompatClient({ baseUrl: "https://api.example/v1/", apiKey: "k", model: "deepseek-chat", fetchImpl })
    const res = await client.complete([{ role: "user", content: "hi" }])
    expect(seenUrl).toBe("https://api.example/v1/chat/completions")
    expect(seenAuth).toBe("Bearer k")
    expect(res.text).toBe('{"ok":true}')
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 30 })
    expect(res.model).toBe("deepseek-chat")
  })

  it("retries once on 500 then succeeds", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      if (calls === 1) return new Response("boom", { status: 500 })
      return completion("ok")
    }) as unknown as typeof fetch
    const client = makeOpenAiCompatClient({ baseUrl: "https://api.example/v1", apiKey: "k", model: "m", fetchImpl })
    await expect(client.complete([{ role: "user", content: "hi" }])).resolves.toMatchObject({ text: "ok" })
    expect(calls).toBe(2)
  })

  it("does not retry 401 and throws LlmError", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response("nope", { status: 401 })
    }) as unknown as typeof fetch
    const client = makeOpenAiCompatClient({ baseUrl: "https://api.example/v1", apiKey: "bad", model: "m", fetchImpl })
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(LlmError)
    expect(calls).toBe(1)
  })
})

describe("estimateCostUsd", () => {
  it("prices input and output tokens per million", () => {
    expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 0 }, { inputPerMTok: 0.3, outputPerMTok: 1 })).toBeCloseTo(0.3, 10)
    expect(estimateCostUsd({ inputTokens: 0, outputTokens: 2_000_000 }, { inputPerMTok: 0.3, outputPerMTok: 1 })).toBeCloseTo(2, 10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/llm.test.ts`
Expected: FAIL — cannot resolve `../src/llm.ts`.

- [ ] **Step 3: Write llm.ts**

`packages/catalog/src/llm.ts`:

```ts
export type ChatMessage = { role: "system" | "user"; content: string }
export type LlmUsage = { inputTokens: number; outputTokens: number }
export type LlmResult = { text: string; usage: LlmUsage; model: string }
export type LlmClient = { complete: (messages: ChatMessage[]) => Promise<LlmResult> }

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

export type LlmPricing = { inputPerMTok: number; outputPerMTok: number }
export const DEFAULT_PRICING: LlmPricing = { inputPerMTok: 0.3, outputPerMTok: 1.0 }

export function estimateCostUsd(usage: LlmUsage, pricing: LlmPricing = DEFAULT_PRICING): number {
  return (usage.inputTokens / 1_000_000) * pricing.inputPerMTok + (usage.outputTokens / 1_000_000) * pricing.outputPerMTok
}

const retryable = (status: number) => status === 429 || status >= 500

export function makeOpenAiCompatClient(opts: {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  temperature?: number
}): LlmClient {
  const fetchImpl = opts.fetchImpl ?? fetch
  const base = opts.baseUrl.replace(/\/+$/, "")
  return {
    async complete(messages) {
      const payload = JSON.stringify({
        model: opts.model,
        messages,
        temperature: opts.temperature ?? 0,
        response_format: { type: "json_object" },
      })
      let lastStatus: number | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetchImpl(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${opts.apiKey}`,
          },
          body: payload,
        })
        if (res.ok) {
          const json = (await res.json()) as {
            choices?: { message?: { content?: string } }[]
            usage?: { prompt_tokens?: number; completion_tokens?: number }
            model?: string
          }
          const text = json.choices?.[0]?.message?.content
          if (typeof text !== "string" || text.length === 0) throw new LlmError("empty completion")
          return {
            text,
            usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
            model: json.model ?? opts.model,
          }
        }
        lastStatus = res.status
        if (!retryable(res.status)) break
      }
      throw new LlmError(`llm request failed (status ${lastStatus})`, lastStatus)
    },
  }
}
```

- [ ] **Step 4: Run llm tests to verify they pass**

Run: `npx vitest run packages/catalog/test/llm.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Write the failing rubric tests**

`packages/catalog/test/rubric.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { LlmClient } from "../src/llm.ts"
import { buildRubricMessages, MAX_BODY_CHARS, makeRubricEvaluator, parseRubricResponse, RUBRIC_VERSION } from "../src/rubric.ts"

const valid = {
  score: 82,
  dimensions: { triggers: 80, clarity: 85, structure: 80, completeness: 75, scope: 90, examples: 85, safety: 95 },
  reasoning: "Clear trigger phrasing and a usable workflow.",
  flags: ["no-examples-for-edge-cases"],
}

describe("buildRubricMessages", () => {
  it("includes the skill and truncates oversized bodies", () => {
    const messages = buildRubricMessages({ id: "a/x", name: "x", description: "d", body: "y".repeat(MAX_BODY_CHARS + 500) })
    expect(messages).toHaveLength(2)
    expect(messages[1]!.content.length).toBeLessThan(MAX_BODY_CHARS + 1_000)
    expect(messages[1]!.content).toContain("[truncated]")
  })
})

describe("parseRubricResponse", () => {
  it("parses plain JSON", () => {
    expect(parseRubricResponse(JSON.stringify(valid)).score).toBe(82)
  })
  it("strips markdown fences", () => {
    expect(parseRubricResponse("```json\n" + JSON.stringify(valid) + "\n```").reasoning).toMatch(/trigger/i)
  })
  it("rejects out-of-range scores", () => {
    expect(() => parseRubricResponse(JSON.stringify({ ...valid, score: 140 }))).toThrow(/invalid rubric response/)
  })
})

describe("makeRubricEvaluator", () => {
  it("returns result, usage, model and cost", async () => {
    const client: LlmClient = {
      complete: async () => ({ text: "```json\n" + JSON.stringify(valid) + "\n```", usage: { inputTokens: 8_000, outputTokens: 400 }, model: "deepseek-chat" }),
    }
    const evaluate = makeRubricEvaluator(client, { inputPerMTok: 0.3, outputPerMTok: 1 })
    const out = await evaluate({ id: "a/x", name: "x", description: "d", body: "# X" })
    expect(out.result.score).toBe(82)
    expect(out.model).toBe("deepseek-chat")
    expect(out.costUsd).toBeCloseTo(0.0028, 6)
  })
  it("exports a versioned rubric id", () => {
    expect(RUBRIC_VERSION).toBe("rubric-v1")
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/rubric.test.ts`
Expected: FAIL — cannot resolve `../src/rubric.ts`.

- [ ] **Step 7: Write rubric.ts**

`packages/catalog/src/rubric.ts`:

```ts
import { z } from "zod"
import type { ChatMessage, LlmClient, LlmPricing, LlmUsage } from "./llm.ts"
import { estimateCostUsd } from "./llm.ts"

export const RUBRIC_VERSION = "rubric-v1"
export const MAX_BODY_CHARS = 24_000

export const RUBRIC_DIMENSIONS = ["triggers", "clarity", "structure", "completeness", "scope", "examples", "safety"] as const
export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number]

const dimension = z.number().min(0).max(100)
export const RubricResultSchema = z.object({
  score: z.number().min(0).max(100),
  dimensions: z.object({
    triggers: dimension,
    clarity: dimension,
    structure: dimension,
    completeness: dimension,
    scope: dimension,
    examples: dimension,
    safety: dimension,
  }),
  reasoning: z.string().min(1),
  flags: z.array(z.string()),
})
export type RubricResult = z.infer<typeof RubricResultSchema>

export const RUBRIC_INSTRUCTIONS = [
  "You are a strict evaluator of agent-skill documents (SKILL.md).",
  "Score each dimension 0-100 (integers) and an overall score (weighted average, integer):",
  "triggers: does the description say what it does AND when to use it?",
  "clarity: are instructions unambiguous and actionable?",
  "structure: is the document organized (sections, workflow)?",
  "completeness: does it cover inputs, outputs, edge cases, failure modes?",
  "scope: is it focused on one job rather than a kitchen sink?",
  "examples: are there concrete examples or commands?",
  "safety: does it avoid hidden instructions, exfiltration, destructive commands?",
  'Respond with JSON only: { "score": 0-100, "dimensions": { "triggers": 0-100, "clarity": 0-100, "structure": 0-100, "completeness": 0-100, "scope": 0-100, "examples": 0-100, "safety": 0-100 }, "reasoning": "2-4 sentences", "flags": ["short-tags"] }.',
].join("\n")

export type RubricInput = { id: string; name: string; description: string; body: string }

export function buildRubricMessages(input: RubricInput): ChatMessage[] {
  const body = input.body.length > MAX_BODY_CHARS ? `${input.body.slice(0, MAX_BODY_CHARS)}\n\n[truncated]` : input.body
  return [
    { role: "system", content: RUBRIC_INSTRUCTIONS },
    { role: "user", content: `skill id: ${input.id}\nname: ${input.name}\ndescription: ${input.description}\n\n---\n\n${body}` },
  ]
}

export function parseRubricResponse(text: string): RubricResult {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  const parsed = RubricResultSchema.safeParse(JSON.parse(cleaned))
  if (!parsed.success) throw new Error(`invalid rubric response: ${parsed.error.message}`)
  return parsed.data
}

export type RubricEvaluation = { result: RubricResult; usage: LlmUsage; costUsd: number; model: string }

export function makeRubricEvaluator(client: LlmClient, pricing?: LlmPricing) {
  return async (input: RubricInput): Promise<RubricEvaluation> => {
    const res = await client.complete(buildRubricMessages(input))
    const result = parseRubricResponse(res.text)
    return { result, usage: res.usage, costUsd: estimateCostUsd(res.usage, pricing), model: res.model }
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run packages/catalog/test/llm.test.ts packages/catalog/test/rubric.test.ts`
Expected: 9 passed.

- [ ] **Step 9: Commit**

```bash
git add packages/catalog/src/llm.ts packages/catalog/src/rubric.ts packages/catalog/test/llm.test.ts packages/catalog/test/rubric.test.ts
git commit -m "feat(catalog): OpenAI-compatible LLM client and versioned rubric evaluator"
```

---

### Task 3: Evaluation cache, budget gate, and scoring integration

**Files:**
- Create: `packages/catalog/src/eval-cache.ts`, `packages/catalog/src/evaluate.ts`
- Modify: `packages/catalog/src/score.ts` (add `rescoreWithQuality`)
- Test: `packages/catalog/test/evaluate.test.ts`, `packages/catalog/test/score.test.ts` (add case)

**Interfaces:**
- Consumes: `RubricEvaluation`/`RUBRIC_VERSION` (Task 2), `Scores`/`SkillRecord` (types), `ScoreWeights`/`DEFAULT_WEIGHTS` (score).
- Produces:
  - `evalKey(contentHash: string, rubricVersion: string): string`; `type EvalCacheEntry`; `type EvalCache = { version: 1; entries: Record<string, EvalCacheEntry> }`; `readEvalCache(file)`, `writeEvalCache(file, cache)`.
  - `type EvaluateFn = (input: { id: string; name: string; description: string; body: string }) => Promise<RubricEvaluation>`
  - `evaluateRecords(records, opts: { cache; evaluate; bodies: Map<string, string>; maxEvals?; maxUsd?; costPerEvalUsd?; weights?; now }): Promise<{ records; cache; stats: EvaluateStats }>` — only `status === "candidate"` records; cache-first, then budget-gated; falls back to the heuristic score with an explicit reason when the budget is exhausted.
  - `type EvaluateStats = { evaluated; cached; skippedBudget; skippedQuarantined; skippedNoBody; spentUsd }`
  - `rescoreWithQuality(input: { scores: Scores; quality: number; reasons: string[]; rubricVersion: string; evaluatedAt: string; weights?: ScoreWeights }): Scores` in `score.ts`.

- [ ] **Step 1: Write the failing evaluate tests**

`packages/catalog/test/evaluate.test.ts`:

```ts
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { evalKey, readEvalCache, writeEvalCache } from "../src/eval-cache.ts"
import { evaluateRecords } from "../src/evaluate.ts"
import { RUBRIC_VERSION, type RubricEvaluation } from "../src/rubric.ts"
import { makeRecord } from "./helpers.ts"

const evaluation = (score: number, costUsd = 0.002): RubricEvaluation => ({
  result: {
    score,
    dimensions: { triggers: score, clarity: score, structure: score, completeness: score, scope: score, examples: score, safety: score },
    reasoning: `score ${score}`,
    flags: [],
  },
  usage: { inputTokens: 1_000, outputTokens: 100 },
  costUsd,
  model: "test-model",
})

const qualityOnly = { quality: 1, trust: 0, freshness: 0, compatibility: 0, adoption: 0 }

describe("eval cache", () => {
  it("round-trips and defaults to empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-eval-"))
    const file = join(dir, "state", "eval-cache.json")
    expect(readEvalCache(file)).toEqual({ version: 1, entries: {} })
    writeEvalCache(file, {
      version: 1,
      entries: {
        [evalKey("a", "v")]: { contentHash: "a", rubricVersion: "v", score: 1, dimensions: {}, reasoning: "r", flags: [], model: "m", costUsd: 0, evaluatedAt: "t" },
      },
    })
    expect(readEvalCache(file).entries[evalKey("a", "v")]?.score).toBe(1)
  })
})

describe("evaluateRecords", () => {
  it("evaluates misses, serves cache hits, respects the budget and skips quarantined", async () => {
    const miss = makeRecord({ id: "a/miss", contentHash: "h1" })
    const cached = makeRecord({ id: "a/cached", contentHash: "h2" })
    const budget = makeRecord({ id: "a/budget", contentHash: "h3" })
    const quarantined = makeRecord({ id: "a/q", contentHash: "h4", status: "quarantined" })
    const cache = {
      version: 1 as const,
      entries: {
        [evalKey("h2", RUBRIC_VERSION)]: { contentHash: "h2", rubricVersion: RUBRIC_VERSION, score: 77, dimensions: {}, reasoning: "cached", flags: [], model: "m", costUsd: 0, evaluatedAt: "2026-01-01T00:00:00.000Z" },
      },
    }
    const calls: string[] = []
    const { records, stats, cache: out } = await evaluateRecords([miss, cached, budget, quarantined], {
      cache,
      bodies: new Map([["a/miss", "# M"], ["a/cached", "# C"], ["a/budget", "# B"]]),
      evaluate: async (input) => {
        calls.push(input.id)
        return evaluation(88)
      },
      maxEvals: 1,
      maxUsd: 1,
      weights: qualityOnly,
      now: new Date("2026-10-05T00:00:00Z"),
    })
    expect(calls).toEqual(["a/miss"])
    expect(stats).toMatchObject({ evaluated: 1, cached: 1, skippedBudget: 1, skippedQuarantined: 1 })
    expect(records[0]!.scores.total).toBe(88)
    expect(records[1]!.scores.total).toBe(77)
    expect(records[2]!.scores.reasons.join(" ")).toMatch(/budget/)
    expect(out.entries[evalKey("h1", RUBRIC_VERSION)]?.score).toBe(88)
  })

  it("stops when the dollar cap would be exceeded", async () => {
    const a = makeRecord({ id: "a/a", contentHash: "ha" })
    const b = makeRecord({ id: "a/b", contentHash: "hb" })
    const { stats } = await evaluateRecords([a, b], {
      cache: { version: 1, entries: {} },
      bodies: new Map([["a/a", "#"], ["a/b", "#"]]),
      evaluate: async () => evaluation(50, 0.02),
      maxUsd: 0.03,
      costPerEvalUsd: 0.02,
      now: new Date("2026-10-05T00:00:00Z"),
    })
    expect(stats.evaluated).toBe(1)
    expect(stats.skippedBudget).toBe(1)
    expect(stats.spentUsd).toBeCloseTo(0.02, 10)
  })
})
```

Append to `packages/catalog/test/score.test.ts` (add `rescoreWithQuality` to the import list):

```ts
  it("rescores quality with the given weights and keeps other parts", () => {
    const base = scoreRecord(healthy)
    const updated = rescoreWithQuality({
      scores: base,
      quality: 100,
      reasons: ["quality: rubric-v1 100"],
      rubricVersion: "rubric-v1",
      evaluatedAt: "2026-10-05T01:00:00.000Z",
      weights: { quality: 1, trust: 0, freshness: 0, compatibility: 0, adoption: 0 },
    })
    expect(updated.total).toBe(100)
    expect(updated.trust).toBe(base.trust)
    expect(updated.reasons).toContain("quality: rubric-v1 100")
    expect(updated.rubricVersion).toBe("rubric-v1")
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/evaluate.test.ts packages/catalog/test/score.test.ts`
Expected: FAIL — cannot resolve `../src/eval-cache.ts`; `rescoreWithQuality` undefined.

- [ ] **Step 3: Add rescoreWithQuality to score.ts**

Append to `packages/catalog/src/score.ts`:

```ts
export function rescoreWithQuality(input: {
  scores: Scores
  quality: number
  reasons: string[]
  rubricVersion: string
  evaluatedAt: string
  weights?: ScoreWeights
}): Scores {
  const weights = input.weights ?? DEFAULT_WEIGHTS
  const quality = clamp(input.quality)
  const total =
    Math.round(
      (quality * weights.quality +
        input.scores.trust * weights.trust +
        input.scores.freshness * weights.freshness +
        input.scores.compatibility * weights.compatibility +
        input.scores.adoption * weights.adoption) *
        100,
    ) / 100
  return {
    ...input.scores,
    quality,
    total,
    reasons: [...input.scores.reasons, ...input.reasons],
    rubricVersion: input.rubricVersion,
    evaluatedAt: input.evaluatedAt,
  }
}
```

- [ ] **Step 4: Write eval-cache.ts and evaluate.ts**

`packages/catalog/src/eval-cache.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export type EvalCacheEntry = {
  contentHash: string
  rubricVersion: string
  score: number
  dimensions: Record<string, number>
  reasoning: string
  flags: string[]
  model: string
  costUsd: number
  evaluatedAt: string
}

export type EvalCache = { version: 1; entries: Record<string, EvalCacheEntry> }

export const evalKey = (contentHash: string, rubricVersion: string): string => `${contentHash}:${rubricVersion}`

export function readEvalCache(file: string): EvalCache {
  if (!existsSync(file)) return { version: 1, entries: {} }
  return JSON.parse(readFileSync(file, "utf8")) as EvalCache
}

export function writeEvalCache(file: string, cache: EvalCache): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(cache, null, 2) + "\n")
}
```

`packages/catalog/src/evaluate.ts`:

```ts
import { evalKey, type EvalCache, type EvalCacheEntry } from "./eval-cache.ts"
import { RUBRIC_VERSION, type RubricEvaluation } from "./rubric.ts"
import { rescoreWithQuality, type ScoreWeights } from "./score.ts"
import type { SkillRecord } from "./types.ts"

export type EvaluateInput = { id: string; name: string; description: string; body: string }
export type EvaluateFn = (input: EvaluateInput) => Promise<RubricEvaluation>

export type EvaluateStats = {
  evaluated: number
  cached: number
  skippedBudget: number
  skippedQuarantined: number
  skippedNoBody: number
  spentUsd: number
}

const applyEntry = (record: SkillRecord, entry: EvalCacheEntry, weights?: ScoreWeights): SkillRecord => {
  const flags = entry.flags.length > 0 ? ` flags: ${entry.flags.join(", ")}` : ""
  const reasons = [`quality: ${entry.rubricVersion} ${entry.score} — ${entry.reasoning.slice(0, 300)}${flags}`]
  return {
    ...record,
    scores: rescoreWithQuality({
      scores: record.scores,
      quality: entry.score,
      reasons,
      rubricVersion: entry.rubricVersion,
      evaluatedAt: entry.evaluatedAt,
      weights,
    }),
  }
}

const markBudgetSkip = (record: SkillRecord): SkillRecord => ({
  ...record,
  scores: { ...record.scores, reasons: [...record.scores.reasons, "quality: heuristic fallback (evaluation budget reached)"] },
})

/** Delta-only, budget-capped rubric evaluation. Only candidate-status records are evaluated. */
export async function evaluateRecords(
  records: SkillRecord[],
  opts: {
    cache: EvalCache
    evaluate: EvaluateFn
    bodies: Map<string, string>
    maxEvals?: number
    maxUsd?: number
    costPerEvalUsd?: number
    weights?: ScoreWeights
    now: Date
  },
): Promise<{ records: SkillRecord[]; cache: EvalCache; stats: EvaluateStats }> {
  const maxEvals = opts.maxEvals ?? Number.POSITIVE_INFINITY
  const maxUsd = opts.maxUsd ?? Number.POSITIVE_INFINITY
  const costPerEvalUsd = opts.costPerEvalUsd ?? 0.01
  const entries = { ...opts.cache.entries }
  const stats: EvaluateStats = { evaluated: 0, cached: 0, skippedBudget: 0, skippedQuarantined: 0, skippedNoBody: 0, spentUsd: 0 }
  const out: SkillRecord[] = []

  for (const record of records) {
    if (record.status !== "candidate") {
      stats.skippedQuarantined++
      out.push(record)
      continue
    }
    const key = evalKey(record.contentHash, RUBRIC_VERSION)
    const hit = entries[key]
    if (hit) {
      stats.cached++
      out.push(applyEntry(record, hit, opts.weights))
      continue
    }
    const body = opts.bodies.get(record.id)
    if (body === undefined) {
      stats.skippedNoBody++
      out.push(record)
      continue
    }
    if (stats.evaluated >= maxEvals || stats.spentUsd + costPerEvalUsd > maxUsd) {
      stats.skippedBudget++
      out.push(markBudgetSkip(record))
      continue
    }
    const evaluation = await opts.evaluate({ id: record.id, name: record.name, description: record.description, body })
    stats.evaluated++
    stats.spentUsd = Math.round((stats.spentUsd + evaluation.costUsd) * 1e6) / 1e6
    const entry: EvalCacheEntry = {
      contentHash: record.contentHash,
      rubricVersion: RUBRIC_VERSION,
      score: evaluation.result.score,
      dimensions: evaluation.result.dimensions,
      reasoning: evaluation.result.reasoning,
      flags: evaluation.result.flags,
      model: evaluation.model,
      costUsd: evaluation.costUsd,
      evaluatedAt: opts.now.toISOString(),
    }
    entries[key] = entry
    out.push(applyEntry(record, entry, opts.weights))
  }

  return { records: out, cache: { version: 1, entries }, stats }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/catalog/test/evaluate.test.ts packages/catalog/test/score.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/catalog/src/eval-cache.ts packages/catalog/src/evaluate.ts packages/catalog/src/score.ts packages/catalog/test
git commit -m "feat(catalog): delta-only rubric evaluation with cache and hard budgets"
```

---

### Task 4: Golden set + calibration + labeling CLI

**Files:**
- Create: `packages/catalog/src/calibrate.ts`, `packages/catalog/src/label.ts`
- Create: `packages/cli/src/commands/depth.ts`
- Modify: `packages/cli/src/bin.ts`
- Test: `packages/catalog/test/calibrate.test.ts`, `packages/catalog/test/label.test.ts`, `packages/cli/test/depth-commands.test.ts`

**Interfaces:**
- Produces:
  - `GoldenSetSchema`, `type GoldenSet = { version: 1; labels: { id: string; tier: 1|2|3|4; notes?: string }[] }`
  - `spearman(a: number[], b: number[]): number` (tie-averaged), `composeTotal(scores: Scores, weights: ScoreWeights): number`
  - `rankAgreement(records: SkillRecord[], golden: GoldenSet, weights?: ScoreWeights): number` — recomposes totals from component parts; positive = agrees with tiers (tier 1 best).
  - `calibrateWeights(records, golden, opts?: { step?: number }): { weights: ScoreWeights; agreement: number; baselineAgreement: number; gridSize: number }` — exhaustive simplex grid, deterministic tie-break toward `DEFAULT_WEIGHTS`.
  - `writeCalibration(path, file: CalibrationFile)`, `readCalibration(path): ScoreWeights | undefined`; `type CalibrationFile = { version: 1; generatedAt; weights; agreement; baselineAgreement; goldenSize }`.
  - `sampleForLabeling(records, limit): SkillRecord[]`, `labelTemplateTsv(records): string`, `parseLabelTsv(tsv): GoldenSet`.
  - CLI: `runCalibrate(l, goldenPath)`, `applyCalibration(l, result, now?)`, `runLabelExport(l, outPath, limit)`, `runLabelImport(tsvPath, outPath)` in `packages/cli/src/commands/depth.ts`.

- [ ] **Step 1: Write the failing calibration tests**

`packages/catalog/test/calibrate.test.ts`:

```ts
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { calibrateWeights, GoldenSetSchema, rankAgreement, readCalibration, spearman, writeCalibration } from "../src/calibrate.ts"
import { makeRecord } from "./helpers.ts"

const withParts = (id: string, parts: { quality: number; trust: number; freshness: number; compatibility: number; adoption: number }) =>
  makeRecord({ id, scores: { ...makeRecord({ id }).scores, ...parts, reasons: [] } })

describe("spearman", () => {
  it("is 1 for identical orders and -1 for reversed", () => {
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10)
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10)
  })
  it("averages ties and handles n<2", () => {
    expect(spearman([1, 1, 2], [1, 2, 2])).toBeCloseTo(0.5, 10)
    expect(spearman([1], [1])).toBe(0)
  })
})

describe("calibrateWeights", () => {
  const records = [
    withParts("a/x", { quality: 90, trust: 50, freshness: 50, compatibility: 50, adoption: 0 }),
    withParts("a/y", { quality: 40, trust: 100, freshness: 100, compatibility: 100, adoption: 100 }),
  ]
  const golden = GoldenSetSchema.parse({ version: 1, labels: [{ id: "a/x", tier: 1 }, { id: "a/y", tier: 2 }] })

  it("recognises that the default weights misorder this set", () => {
    expect(rankAgreement(records, golden)).toBeCloseTo(-1, 5)
  })

  it("finds weights that agree with the golden set", () => {
    const result = calibrateWeights(records, golden)
    expect(result.agreement).toBeGreaterThan(result.baselineAgreement)
    expect(result.agreement).toBeCloseTo(1, 5)
    expect(result.gridSize).toBeGreaterThan(1_000)
    expect(Math.abs(result.weights.quality + result.weights.trust + result.weights.freshness + result.weights.compatibility + result.weights.adoption - 1)).toBeLessThan(1e-9)
  })

  it("round-trips the calibration file", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-cal-"))
    const file = join(dir, "calibration.json")
    const result = calibrateWeights(records, golden)
    writeCalibration(file, { version: 1, generatedAt: "2026-10-05T00:00:00.000Z", weights: result.weights, agreement: result.agreement, baselineAgreement: result.baselineAgreement, goldenSize: 2 })
    expect(readCalibration(file)).toEqual(result.weights)
    expect(readCalibration(join(dir, "missing.json"))).toBeUndefined()
    expect(readFileSync(file, "utf8")).toContain("weights")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/calibrate.test.ts`
Expected: FAIL — cannot resolve `../src/calibrate.ts`.

- [ ] **Step 3: Write calibrate.ts**

`packages/catalog/src/calibrate.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { z } from "zod"
import { DEFAULT_WEIGHTS, type ScoreWeights } from "./score.ts"
import type { Scores, SkillRecord } from "./types.ts"

export const GoldenSetSchema = z.object({
  version: z.literal(1),
  labels: z.array(
    z.object({
      id: z.string(),
      tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      notes: z.string().optional(),
    }),
  ),
})
export type GoldenSet = z.infer<typeof GoldenSetSchema>

export type CalibrationFile = {
  version: 1
  generatedAt: string
  weights: ScoreWeights
  agreement: number
  baselineAgreement: number
  goldenSize: number
}

const WEIGHT_KEYS = ["quality", "trust", "freshness", "compatibility", "adoption"] as const

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i)
  const out = new Array<number>(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k]!.i] = avg
    i = j + 1
  }
  return out
}

export function spearman(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0
  const ra = ranks(a)
  const rb = ranks(b)
  const n = a.length
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / n
  const ma = mean(ra)
  const mb = mean(rb)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = ra[i]! - ma
    const y = rb[i]! - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db)
}

export function composeTotal(scores: Scores, weights: ScoreWeights): number {
  return (
    Math.round(
      (scores.quality * weights.quality +
        scores.trust * weights.trust +
        scores.freshness * weights.freshness +
        scores.compatibility * weights.compatibility +
        scores.adoption * weights.adoption) *
        100,
    ) / 100
  )
}

export function rankAgreement(records: SkillRecord[], golden: GoldenSet, weights: ScoreWeights = DEFAULT_WEIGHTS): number {
  const byId = new Map(records.map((r) => [r.id, r]))
  const labelled = golden.labels
    .map((label) => ({ record: byId.get(label.id), tier: label.tier }))
    .filter((x): x is { record: SkillRecord; tier: number } => x.record !== undefined)
  if (labelled.length < 2) return 0
  return spearman(
    labelled.map((l) => composeTotal(l.record.scores, weights)),
    labelled.map((l) => -l.tier),
  )
}

const distanceFromDefault = (w: ScoreWeights): number => WEIGHT_KEYS.reduce((s, k) => s + Math.abs(w[k] - DEFAULT_WEIGHTS[k]), 0)

export type CalibrationResult = { weights: ScoreWeights; agreement: number; baselineAgreement: number; gridSize: number }

export function calibrateWeights(records: SkillRecord[], golden: GoldenSet, opts: { step?: number } = {}): CalibrationResult {
  const step = opts.step ?? 0.05
  const n = Math.max(1, Math.round(1 / step))
  const baselineAgreement = rankAgreement(records, golden)
  let best: { weights: ScoreWeights; agreement: number } | undefined
  let gridSize = 0
  for (let q = 0; q <= n; q++) {
    for (let t = 0; q + t <= n; t++) {
      for (let f = 0; q + t + f <= n; f++) {
        for (let c = 0; q + t + f + c <= n; c++) {
          const a = n - (q + t + f + c)
          gridSize++
          const weights: ScoreWeights = { quality: q / n, trust: t / n, freshness: f / n, compatibility: c / n, adoption: a / n }
          const agreement = rankAgreement(records, golden, weights)
          if (
            !best ||
            agreement > best.agreement + 1e-9 ||
            (Math.abs(agreement - best.agreement) <= 1e-9 && distanceFromDefault(weights) < distanceFromDefault(best.weights) - 1e-9)
          ) {
            best = { weights, agreement }
          }
        }
      }
    }
  }
  return { weights: best?.weights ?? DEFAULT_WEIGHTS, agreement: best?.agreement ?? baselineAgreement, baselineAgreement, gridSize }
}

export function writeCalibration(path: string, file: CalibrationFile): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n")
}

export function readCalibration(path: string): ScoreWeights | undefined {
  if (!existsSync(path)) return undefined
  const file = JSON.parse(readFileSync(path, "utf8")) as CalibrationFile
  return file.weights
}
```

- [ ] **Step 4: Run calibration tests to verify they pass**

Run: `npx vitest run packages/catalog/test/calibrate.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Write the failing label tests**

`packages/catalog/test/label.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { labelTemplateTsv, parseLabelTsv, sampleForLabeling } from "../src/label.ts"
import { GoldenSetSchema } from "../src/calibrate.ts"
import { makeRecord } from "./helpers.ts"

const records = Array.from({ length: 10 }, (_, i) =>
  makeRecord({ id: `a/s${i}`, scores: { ...makeRecord({ id: "z" }).scores, total: 100 - i * 5 } }),
)

describe("sampleForLabeling", () => {
  it("spreads the sample across the score range", () => {
    const sample = sampleForLabeling(records, 3)
    expect(sample.map((r) => r.id)).toEqual(["a/s0", "a/s4", "a/s9"])
  })
  it("returns all candidates when the limit exceeds the pool", () => {
    expect(sampleForLabeling(records, 50)).toHaveLength(10)
  })
})

describe("label TSV", () => {
  it("exports a header plus one row per record", () => {
    const tsv = labelTemplateTsv(records.slice(0, 2))
    const lines = tsv.trim().split("\n")
    expect(lines[0]).toBe("id\tname\tcategory\tcluster\tscore\ttier\tnotes")
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain("a/s0")
  })
  it("parses filled tiers and skips blank rows", () => {
    const tsv = [
      "id\tname\tcategory\tcluster\tscore\ttier\tnotes",
      "a/s0\ts0\tengineering\tc-1\t100\t1\tgreat",
      "a/s1\ts1\tengineering\tc-1\t95\t\tnot labelled",
      "a/s2\ts2\tengineering\tc-2\t90\t4\tweak",
    ].join("\n")
    const golden = parseLabelTsv(tsv)
    expect(golden.labels).toEqual([
      { id: "a/s0", tier: 1 },
      { id: "a/s2", tier: 4 },
    ])
    expect(GoldenSetSchema.safeParse(golden).success).toBe(true)
  })
  it("throws on an invalid tier", () => {
    const tsv = "id\tname\tcategory\tcluster\tscore\ttier\tnotes\na/s0\ts0\tc\tc\t1\t9\t"
    expect(() => parseLabelTsv(tsv)).toThrow(/invalid tier/)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/label.test.ts`
Expected: FAIL — cannot resolve `../src/label.ts`.

- [ ] **Step 7: Write label.ts**

`packages/catalog/src/label.ts`:

```ts
import { GoldenSetSchema, type GoldenSet } from "./calibrate.ts"
import type { SkillRecord } from "./types.ts"

const HEADER = "id\tname\tcategory\tcluster\tscore\ttier\tnotes"

/** Deterministic, score-range-spread sample of candidates for a human labeling session. */
export function sampleForLabeling(records: SkillRecord[], limit: number): SkillRecord[] {
  const candidates = records
    .filter((r) => r.status === "candidate")
    .sort((a, b) => b.scores.total - a.scores.total || a.id.localeCompare(b.id))
  if (candidates.length <= limit) return candidates
  const step = candidates.length / limit
  const out: SkillRecord[] = []
  for (let i = 0; i < limit; i++) out.push(candidates[Math.min(candidates.length - 1, Math.round(i * step))]!)
  return out
}

export function labelTemplateTsv(records: SkillRecord[]): string {
  const rows = records.map((r) => [r.id, r.name, r.category, r.clusterId, String(r.scores.total), "", ""].join("\t"))
  return [HEADER, ...rows].join("\n") + "\n"
}

/** Parse a filled worksheet. Tier 1 = best. Blank tiers are skipped; invalid tiers throw. */
export function parseLabelTsv(tsv: string): GoldenSet {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const labels: GoldenSet["labels"] = []
  for (const [index, line] of lines.entries()) {
    const cells = line.split("\t")
    if (index === 0 && cells[0] === "id") continue
    const id = cells[0]?.trim() ?? ""
    const tierRaw = cells[5]?.trim() ?? ""
    if (!id || tierRaw === "") continue
    const tier = Number(tierRaw)
    if (![1, 2, 3, 4].includes(tier)) throw new Error(`invalid tier "${tierRaw}" for ${id} (expected 1-4)`)
    labels.push({ id, tier: tier as 1 | 2 | 3 | 4 })
  }
  return GoldenSetSchema.parse({ version: 1, labels })
}
```

- [ ] **Step 8: Run label tests to verify they pass**

Run: `npx vitest run packages/catalog/test/label.test.ts packages/catalog/test/calibrate.test.ts`
Expected: all pass.

- [ ] **Step 9: Write the failing CLI depth tests**

`packages/cli/test/depth-commands.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { makeRecord } from "../../catalog/test/helpers.ts"
import { applyCalibration, runCalibrate, runLabelExport, runLabelImport } from "../src/commands/depth.ts"
import { layout } from "../src/paths.ts"

const withParts = (id: string, parts: { quality: number; trust: number; freshness: number; compatibility: number; adoption: number }) =>
  makeRecord({ id, scores: { ...makeRecord({ id }).scores, ...parts, reasons: [] } })

const writeIndex = (l: ReturnType<typeof layout>, skills: unknown[]) => {
  mkdirSync(l.catalogDir, { recursive: true })
  writeFileSync(join(l.catalogDir, "index.json"), JSON.stringify({ version: 1, generatedAt: "", counts: { total: skills.length, byStatus: {}, byCategory: {} }, skills }))
}

describe("calibrate command", () => {
  it("improves agreement and writes the calibration file", () => {
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-cli-depth-")))
    writeIndex(l, [
      withParts("a/x", { quality: 90, trust: 50, freshness: 50, compatibility: 50, adoption: 0 }),
      withParts("a/y", { quality: 40, trust: 100, freshness: 100, compatibility: 100, adoption: 100 }),
    ])
    const goldenPath = join(l.root, "golden.json")
    writeFileSync(goldenPath, JSON.stringify({ version: 1, labels: [{ id: "a/x", tier: 1 }, { id: "a/y", tier: 2 }] }))
    const result = runCalibrate(l, goldenPath)
    expect(result.agreement).toBeGreaterThan(result.baselineAgreement)
    const written = applyCalibration(l, result, new Date("2026-10-05T00:00:00Z"))
    expect(readFileSync(written, "utf8")).toContain("weights")
  })
})

describe("label command", () => {
  it("exports a worksheet and imports a golden set", () => {
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-cli-label-")))
    writeIndex(l, [1, 2, 3].map((i) => makeRecord({ id: `a/s${i}` })))
    const tsvPath = join(l.root, "worksheet.tsv")
    expect(runLabelExport(l, tsvPath, 2)).toBe(2)
    const lines = readFileSync(tsvPath, "utf8").trim().split("\n")
    const filled = [`${lines[0]}`, ...lines.slice(1).map((line, i) => `${line.replace(/\t*$/, "")}\t${i + 1}\t`)]
    writeFileSync(tsvPath, filled.join("\n") + "\n")
    const outPath = join(l.root, "golden.json")
    expect(runLabelImport(tsvPath, outPath)).toBe(2)
    const golden = JSON.parse(readFileSync(outPath, "utf8"))
    expect(golden.labels[0].tier).toBe(1)
    expect(golden.version).toBe(1)
  })
})
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx vitest run packages/cli/test/depth-commands.test.ts`
Expected: FAIL — cannot resolve `../src/commands/depth.ts`.

- [ ] **Step 11: Write depth.ts and wire bin.ts**

`packages/cli/src/commands/depth.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { calibrateWeights, GoldenSetSchema, writeCalibration, type CalibrationResult } from "../../../catalog/src/calibrate.ts"
import { labelTemplateTsv, parseLabelTsv, sampleForLabeling } from "../../../catalog/src/label.ts"
import type { StoreLayout } from "../paths.ts"
import { readCatalog } from "./read.ts"

export function runCalibrate(l: StoreLayout, goldenPath: string): CalibrationResult & { goldenSize: number } {
  const index = readCatalog(l)
  const golden = GoldenSetSchema.parse(JSON.parse(readFileSync(goldenPath, "utf8")))
  const result = calibrateWeights(index.skills, golden)
  return { ...result, goldenSize: golden.labels.length }
}

export function applyCalibration(l: StoreLayout, result: CalibrationResult & { goldenSize: number }, now: Date = new Date()): string {
  const path = join(l.catalogDir, "calibration.json")
  writeCalibration(path, {
    version: 1,
    generatedAt: now.toISOString(),
    weights: result.weights,
    agreement: result.agreement,
    baselineAgreement: result.baselineAgreement,
    goldenSize: result.goldenSize,
  })
  return path
}

export function runLabelExport(l: StoreLayout, outPath: string, limit: number): number {
  const sample = sampleForLabeling(readCatalog(l).skills, limit)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, labelTemplateTsv(sample))
  return sample.length
}

export function runLabelImport(tsvPath: string, outPath: string): number {
  const golden = parseLabelTsv(readFileSync(tsvPath, "utf8"))
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(golden, null, 2) + "\n")
  return golden.labels.length
}
```

In `packages/cli/src/bin.ts`, add the imports and commands (place after the `catalog import` block):

```ts
import { applyCalibration, runCalibrate, runLabelExport, runLabelImport } from "./commands/depth.ts"
```

```ts
program
  .command("calibrate")
  .option("--golden <file>", "golden set JSON file", "golden.json")
  .option("--json", "machine-readable output")
  .option("--apply", "write catalog/calibration.json")
  .action((opts: { golden: string; json?: boolean; apply?: boolean }) => {
    const result = runCalibrate(store(), opts.golden)
    const path = opts.apply ? applyCalibration(store(), result) : undefined
    if (opts.json) {
      console.log(JSON.stringify({ ...result, applied: path }, null, 2))
    } else {
      console.log(`golden set: ${result.goldenSize} labels; agreement ${result.agreement.toFixed(3)} (baseline ${result.baselineAgreement.toFixed(3)}), grid ${result.gridSize}`)
      console.log(`weights: ${JSON.stringify(result.weights)}`)
      if (path) console.log(`applied -> ${path}`)
    }
  })

const labelCommand = program.command("label")
labelCommand
  .command("export")
  .option("--out <file>", "worksheet path", "label-worksheet.tsv")
  .option("--limit <n>", "sample size", "40")
  .action((opts: { out: string; limit: string }) => {
    const count = runLabelExport(store(), opts.out, Number(opts.limit))
    console.log(`wrote ${count} candidate(s) to ${opts.out} — fill the tier column (1=best … 4=weak), then run: skillhub label import ${opts.out}`)
  })
labelCommand
  .command("import")
  .argument("<tsv>")
  .option("--out <file>", "golden set output", "golden.json")
  .action((tsv: string, opts: { out: string }) => {
    const count = runLabelImport(tsv, opts.out)
    console.log(`imported ${count} label(s) -> ${opts.out}`)
  })
```

- [ ] **Step 12: Run tests + typecheck**

Run: `npx vitest run packages/cli/test/depth-commands.test.ts packages/catalog/test/calibrate.test.ts packages/catalog/test/label.test.ts && npm run typecheck`
Expected: all pass; typecheck clean.

- [ ] **Step 13: Commit**

```bash
git add packages/catalog/src/calibrate.ts packages/catalog/src/label.ts packages/catalog/test/calibrate.test.ts packages/catalog/test/label.test.ts packages/cli/src/commands/depth.ts packages/cli/src/bin.ts packages/cli/test/depth-commands.test.ts
git commit -m "feat(catalog): golden-set calibration and labeling CLI"
```

---

### Task 5: Embeddings + clustering depth (stable IDs, duplicate linking)

**Files:**
- Create: `packages/catalog/src/embed.ts`, `packages/catalog/src/cluster-refine.ts`
- Test: `packages/catalog/test/embed.test.ts`, `packages/catalog/test/cluster-refine.test.ts`

**Interfaces:**
- Produces:
  - `EMBED_DIM = 192`; `type Embedder = (text: string) => Float64Array`
  - `tokenize(text): string[]` (words + bigrams), `embedText(text, dim?): Float64Array` (FNV-1a hashing trick, signed, L2-normalized), `cosine(a, b): number`
  - `kmeans(vectors: Float64Array[], k, seed, iters?): { centroids: Float64Array[]; assignments: number[] }` — deterministic k-means++ (mulberry32), empty clusters keep their previous centroid.
  - `type ClusterState = { version: 1; generatedAt: string; clusters: { id: string; label: string; centroid: number[] }[] }`; `readClusterState(file)`, `writeClusterState(file, state)`.
  - `refineClusters(records, opts: { embed?; k?; seed?; prev?; dupThreshold?; now }): { records; state; assignments: Record<string, string>; duplicates: { canonical; duplicate }[] }` — overrides `clusterId`/`clusterLabel`; keeps previous cluster IDs when the new centroid matches (cosine ≥ 0.75); links cosine ≥ `dupThreshold` (0.97) pairs by score and rewrites `relations.duplicates` on both sides.

- [ ] **Step 1: Write the failing embed tests**

`packages/catalog/test/embed.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { cosine, embedText, EMBED_DIM, tokenize } from "../src/embed.ts"

describe("embedText", () => {
  it("is deterministic and L2-normalized", () => {
    const a = embedText("PDF manipulation and text extraction")
    const b = embedText("PDF manipulation and text extraction")
    expect(a).toEqual(b)
    expect(a.length).toBe(EMBED_DIM)
    let norm = 0
    for (const v of a) norm += v * v
    expect(Math.sqrt(norm)).toBeCloseTo(1, 10)
  })

  it("scores similar text higher than unrelated text", () => {
    const base = embedText("PDF text extraction and document conversion")
    const near = embedText("Extract text from PDF documents and convert them")
    const far = embedText("Kubernetes cluster deployment and observability")
    expect(cosine(base, near)).toBeGreaterThan(cosine(base, far))
  })

  it("tokenizes words and bigrams", () => {
    expect(tokenize("PDF! text")).toEqual(["pdf", "text", "pdf_text"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/embed.test.ts`
Expected: FAIL — cannot resolve `../src/embed.ts`.

- [ ] **Step 3: Write embed.ts**

`packages/catalog/src/embed.ts`:

```ts
export const EMBED_DIM = 192

export type Embedder = (text: string) => Float64Array

const hash32 = (value: string): number => {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1)
  const out = [...words]
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]}_${words[i + 1]}`)
  return out
}

/** Deterministic, dependency-free hashing-trick embedding (words + bigrams), L2-normalized. */
export function embedText(text: string, dim: number = EMBED_DIM): Float64Array {
  const vector = new Float64Array(dim)
  for (const token of tokenize(text)) {
    const h = hash32(token)
    vector[h % dim] += (h >>> 31) & 1 ? -1 : 1
  }
  let norm = 0
  for (let i = 0; i < dim; i++) norm += vector[i]! * vector[i]!
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < dim; i++) vector[i] = vector[i]! / norm
  return vector
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}
```

- [ ] **Step 4: Run embed tests to verify they pass**

Run: `npx vitest run packages/catalog/test/embed.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the failing cluster-refine tests**

`packages/catalog/test/cluster-refine.test.ts`:

```ts
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { kmeans, readClusterState, refineClusters, writeClusterState } from "../src/cluster-refine.ts"
import { makeRecord } from "./helpers.ts"

const rec = (id: string, text: string, total = 50, tags: string[] = []) =>
  makeRecord({ id, name: text, description: text, tags, scores: { ...makeRecord({ id }).scores, total } })

describe("kmeans", () => {
  it("separates two well-separated blobs deterministically", () => {
    const a = Float64Array.from([1, 0, 0])
    const b = Float64Array.from([0, 1, 0])
    const vectors = [a, a, b, b]
    const one = kmeans(vectors, 2, 7)
    const two = kmeans(vectors, 2, 7)
    expect(one.assignments).toEqual(two.assignments)
    expect(one.assignments[0]).toBe(one.assignments[1])
    expect(one.assignments[2]).toBe(one.assignments[3])
    expect(one.assignments[0]).not.toBe(one.assignments[2])
  })
})

const records = [
  rec("a/pdf1", "pdf text extraction from documents", 80, ["pdf"]),
  rec("a/pdf2", "extract text from pdf documents", 70, ["pdf"]),
  rec("a/k8s1", "kubernetes deployment and cluster observability", 60, ["kubernetes"]),
  rec("a/k8s2", "observability for kubernetes cluster deployments", 50, ["kubernetes"]),
]

describe("refineClusters", () => {
  it("groups related skills across the two clusters", () => {
    const { records: out, state, assignments, duplicates } = refineClusters(records, { k: 2, seed: 7, now: new Date("2026-10-05T00:00:00Z") })
    expect(assignments["a/pdf1"]).toBe(assignments["a/pdf2"])
    expect(assignments["a/k8s1"]).toBe(assignments["a/k8s2"])
    expect(assignments["a/pdf1"]).not.toBe(assignments["a/k8s1"])
    expect(state.clusters).toHaveLength(2)
    expect(out.find((r) => r.id === "a/pdf1")!.clusterId).toBe(assignments["a/pdf1"])
    expect(duplicates).toEqual([])
  })

  it("keeps cluster ids stable across runs via centroid matching", () => {
    const first = refineClusters(records, { k: 2, seed: 7, now: new Date("2026-10-05T00:00:00Z") })
    const second = refineClusters(records, { k: 2, seed: 7, prev: first.state, now: new Date("2026-10-06T00:00:00Z") })
    expect(second.assignments).toEqual(first.assignments)
    expect(second.state.clusters.map((c) => c.id).sort()).toEqual(first.state.clusters.map((c) => c.id).sort())
  })

  it("links near-identical records to a canonical entry", () => {
    const exact = [rec("a/one", "seo audit for websites", 90, ["seo"]), rec("a/copy", "seo audit for websites", 60, ["seo"])]
    const { records: out, duplicates } = refineClusters(exact, { k: 2, seed: 1, now: new Date("2026-10-05T00:00:00Z") })
    expect(duplicates).toEqual([{ canonical: "a/one", duplicate: "a/copy" }])
    expect(out.find((r) => r.id === "a/copy")!.relations.duplicates).toEqual(["a/one"])
    expect(out.find((r) => r.id === "a/one")!.relations.duplicates).toEqual(["a/copy"])
  })

  it("round-trips cluster state", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-clusters-"))
    const file = join(dir, "clusters-state.json")
    const { state } = refineClusters(records, { k: 2, seed: 7, now: new Date("2026-10-05T00:00:00Z") })
    writeClusterState(file, state)
    expect(readClusterState(file)).toEqual(state)
    expect(readClusterState(join(dir, "missing.json"))).toBeUndefined()
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/cluster-refine.test.ts`
Expected: FAIL — cannot resolve `../src/cluster-refine.ts`.

- [ ] **Step 7: Write cluster-refine.ts**

`packages/catalog/src/cluster-refine.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { cosine, embedText, type Embedder } from "./embed.ts"
import { sha256 } from "./parse.ts"
import type { SkillRecord } from "./types.ts"

export type ClusterState = {
  version: 1
  generatedAt: string
  clusters: { id: string; label: string; centroid: number[] }[]
}

export function readClusterState(file: string): ClusterState | undefined {
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, "utf8")) as ClusterState
}

export function writeClusterState(file: string, state: ClusterState): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n")
}

const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Deterministic k-means++ over unit vectors. Empty clusters keep their previous centroid. */
export function kmeans(vectors: Float64Array[], k: number, seed: number, iters = 25): { centroids: Float64Array[]; assignments: number[] } {
  const n = vectors.length
  const dim = vectors[0]?.length ?? 0
  const kk = Math.max(1, Math.min(k, n))
  const rng = mulberry32(seed)

  const centroids: Float64Array[] = [Float64Array.from(vectors[0]!)]
  while (centroids.length < kk) {
    const distances = vectors.map((v) => {
      let best = Number.POSITIVE_INFINITY
      for (const c of centroids) best = Math.min(best, 1 - cosine(v, c))
      return Math.max(0, best)
    })
    const total = distances.reduce((s, d) => s + d, 0)
    let target = total > 0 ? rng() * total : 0
    let index = 0
    for (let i = 0; i < n; i++) {
      target -= distances[i]!
      index = i
      if (target <= 0) break
    }
    centroids.push(Float64Array.from(vectors[index]!))
  }

  const assignments = new Array<number>(n).fill(0)
  for (let iter = 0; iter < iters; iter++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestSimilarity = Number.NEGATIVE_INFINITY
      for (let c = 0; c < centroids.length; c++) {
        const similarity = cosine(vectors[i]!, centroids[c]!)
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity
          best = c
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best
        changed = true
      }
    }
    const sums = centroids.map(() => new Float64Array(dim))
    const counts = new Array<number>(centroids.length).fill(0)
    for (let i = 0; i < n; i++) {
      const c = assignments[i]!
      counts[c]!++
      const sum = sums[c]!
      for (let d = 0; d < dim; d++) sum[d] += vectors[i]![d]!
    }
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c] === 0) continue
      const next = new Float64Array(dim)
      let norm = 0
      for (let d = 0; d < dim; d++) {
        next[d] = sums[c]![d]! / counts[c]!
        norm += next[d]! * next[d]!
      }
      norm = Math.sqrt(norm)
      if (norm > 0) for (let d = 0; d < dim; d++) next[d] = next[d]! / norm
      centroids[c] = next
    }
    if (!changed && iter > 0) break
  }
  return { centroids, assignments }
}

const displayLabel = (tag: string) => tag.replace(/\b\w/g, (c) => c.toUpperCase())

export type RefineResult = {
  records: SkillRecord[]
  state: ClusterState
  assignments: Record<string, string>
  duplicates: { canonical: string; duplicate: string }[]
}

export function refineClusters(
  records: SkillRecord[],
  opts: { embed?: Embedder; k?: number; seed?: number; prev?: ClusterState; dupThreshold?: number; now: Date },
): RefineResult {
  const embed = opts.embed ?? ((text: string) => embedText(text))
  if (records.length === 0) {
    return { records, state: { version: 1, generatedAt: opts.now.toISOString(), clusters: [] }, assignments: {}, duplicates: [] }
  }

  const vectors = records.map((record) => embed(`${record.name} ${record.description} ${record.tags.join(" ")}`))
  const k = opts.k ?? Math.round(Math.sqrt(records.length)) || 1
  const { centroids, assignments: memberOf } = kmeans(vectors, k, opts.seed ?? 42)

  const prevById = new Map((opts.prev?.clusters ?? []).map((c) => [c.id, c]))
  const used = new Set<string>()
  const clusters = centroids.map((centroid, index) => {
    const memberIndexes = records.map((_, i) => i).filter((i) => memberOf[i] === index)
    let id: string | undefined
    let label: string | undefined
    if (opts.prev) {
      let best: { id: string; similarity: number } | undefined
      for (const prev of opts.prev.clusters) {
        if (used.has(prev.id)) continue
        const similarity = cosine(centroid, Float64Array.from(prev.centroid))
        if (!best || similarity > best.similarity) best = { id: prev.id, similarity }
      }
      if (best && best.similarity >= 0.75) {
        id = best.id
        label = prevById.get(best.id)?.label
        used.add(id)
      }
    }
    if (!id) id = `c-${sha256(memberIndexes.map((i) => records[i]!.id).sort().join(",")).slice(0, 8)}`
    if (!label) {
      const tagCounts = new Map<string, number>()
      for (const i of memberIndexes) for (const tag of records[i]!.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      label = displayLabel([...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "general")
    }
    return { id, label, centroid: Array.from(centroid, (v) => Math.round(v * 10_000) / 10_000), memberIndexes }
  })

  const clusterOf = new Map<string, string>()
  const recordCluster = new Map<number, { id: string; label: string }>()
  for (const cluster of clusters) {
    for (const i of cluster.memberIndexes) {
      clusterOf.set(records[i]!.id, cluster.id)
      recordCluster.set(i, { id: cluster.id, label: cluster.label })
    }
  }

  const dupThreshold = opts.dupThreshold ?? 0.97
  const duplicates: { canonical: string; duplicate: string }[] = []
  const duplicateOf = new Map<number, number>()
  for (const cluster of clusters) {
    const members = [...cluster.memberIndexes]
      .sort((a, b) => records[b]!.scores.total - records[a]!.scores.total || records[a]!.id.localeCompare(records[b]!.id))
      .slice(0, 200)
    for (let x = 0; x < members.length; x++) {
      for (let y = x + 1; y < members.length; y++) {
        const canonical = members[x]!
        const candidate = members[y]!
        if (duplicateOf.has(canonical) || duplicateOf.has(candidate)) continue
        if (cosine(vectors[canonical]!, vectors[candidate]!) >= dupThreshold) {
          duplicateOf.set(candidate, canonical)
          duplicates.push({ canonical: records[canonical]!.id, duplicate: records[candidate]!.id })
        }
      }
    }
  }

  const linked = new Map<number, string[]>()
  for (const [duplicate, canonical] of duplicateOf) {
    const list = linked.get(canonical) ?? []
    list.push(records[duplicate]!.id)
    linked.set(canonical, list)
  }

  const out = records.map((record, index) => {
    const cluster = recordCluster.get(index)!
    const canonicalForMe = duplicateOf.get(index)
    const relations =
      canonicalForMe !== undefined
        ? { ...record.relations, duplicates: [records[canonicalForMe]!.id] }
        : linked.has(index)
          ? { ...record.relations, duplicates: linked.get(index)!.sort() }
          : record.relations
    return { ...record, clusterId: cluster.id, clusterLabel: cluster.label, relations }
  })

  return {
    records: out,
    state: {
      version: 1,
      generatedAt: opts.now.toISOString(),
      clusters: clusters.map((c) => ({ id: c.id, label: c.label, centroid: c.centroid })),
    },
    assignments: Object.fromEntries([...clusterOf.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    duplicates,
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run packages/catalog/test/embed.test.ts packages/catalog/test/cluster-refine.test.ts`
Expected: all pass (7 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/catalog/src/embed.ts packages/catalog/src/cluster-refine.ts packages/catalog/test/embed.test.ts packages/catalog/test/cluster-refine.test.ts
git commit -m "feat(catalog): embedding clustering with stable ids and duplicate linking"
```

---

### Task 6: Trending from star snapshots

**Files:**
- Create: `packages/catalog/src/trending.ts`
- Modify: `packages/cli/src/commands/depth.ts` (add `formatTrending`)
- Modify: `packages/cli/src/bin.ts` (add `trending` command)
- Test: `packages/catalog/test/trending.test.ts`, `packages/cli/test/depth-commands.test.ts` (add case)

**Interfaces:**
- Produces:
  - `type StarSnapshot = { version: 1; date: string; repos: Record<string, number> }`
  - `type TrendingFile = { version: 1; generatedAt; topVelocity: { id; repo; stars; delta7d; delta30d }[]; newThisMonth: { id; repo; createdAt; stars }[] }`
  - `snapshotFromRecords(records, now): StarSnapshot` (max stars per repo, remote only, sorted keys)
  - `selectBaseline(snapshots, now, days): StarSnapshot | undefined` (newest snapshot at least `days` old)
  - `computeTrending(records, { snapshots, now, limit? }): TrendingFile` — topVelocity only where delta > 0, sorted delta7d → delta30d → stars → repo; newThisMonth = candidates created within 30 days, top 10 by stars.
  - `writeSnapshot(dir, snapshot): string` (`<dir>/snapshots/YYYY-MM-DD.json`), `readSnapshots(dir): StarSnapshot[]` (sorted, missing dir → `[]`)
  - CLI `formatTrending(file): string`.

- [ ] **Step 1: Write the failing trending tests**

`packages/catalog/test/trending.test.ts`:

```ts
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { computeTrending, readSnapshots, selectBaseline, snapshotFromRecords, writeSnapshot, type StarSnapshot } from "../src/trending.ts"
import { makeRecord } from "./helpers.ts"

const now = new Date("2026-10-05T00:00:00Z")
const repoRec = (id: string, repo: string, stars: number, createdAt: string | null = null, total = 50) =>
  makeRecord({ id, source: { kind: "github", repo, path: "SKILL.md", ref: "abc" }, signals: { stars, createdAt }, scores: { ...makeRecord({ id }).scores, total } })

const snap = (date: string, repos: Record<string, number>): StarSnapshot => ({ version: 1, date, repos })

describe("snapshots", () => {
  it("takes max stars per repo and round-trips to disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "skillhub-trend-"))
    const snapshot = snapshotFromRecords([repoRec("a/x", "acme/skills", 10), repoRec("a/y", "acme/skills", 30)], now)
    expect(snapshot.repos).toEqual({ "acme/skills": 30 })
    writeSnapshot(dir, snapshot)
    expect(readSnapshots(dir)).toHaveLength(1)
    expect(readSnapshots(join(dir, "nope"))).toEqual([])
  })

  it("selects the newest baseline at least N days old", () => {
    const snapshots = [snap("2026-09-01T00:00:00Z", { a: 5 }), snap("2026-10-01T00:00:00Z", { a: 20 })]
    expect(selectBaseline(snapshots, now, 7)?.date).toBe("2026-10-01T00:00:00Z")
    expect(selectBaseline(snapshots, now, 40)?.date).toBe("2026-09-01T00:00:00Z")
    expect(selectBaseline(snapshots, now, 400)).toBeUndefined()
  })
})

describe("computeTrending", () => {
  it("computes 7d/30d velocity and new-this-month", () => {
    const records = [repoRec("a/x", "acme/skills", 100), repoRec("a/new", "newco/fresh", 5, "2026-09-20T00:00:00Z")]
    const trending = computeTrending(records, {
      snapshots: [snap("2026-09-28T00:00:00Z", { "acme/skills": 80 }), snap("2026-09-01T00:00:00Z", { "acme/skills": 50 })],
      now,
    })
    expect(trending.topVelocity[0]).toMatchObject({ id: "a/x", repo: "acme/skills", delta7d: 20, delta30d: 50 })
    expect(trending.newThisMonth.map((e) => e.id)).toEqual(["a/new"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/trending.test.ts`
Expected: FAIL — cannot resolve `../src/trending.ts`.

- [ ] **Step 3: Write trending.ts**

`packages/catalog/src/trending.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { SkillRecord } from "./types.ts"

export type StarSnapshot = { version: 1; date: string; repos: Record<string, number> }
export type TrendingEntry = { id: string; repo: string; stars: number; delta7d: number; delta30d: number }
export type TrendingFile = {
  version: 1
  generatedAt: string
  topVelocity: TrendingEntry[]
  newThisMonth: { id: string; repo: string; createdAt: string; stars: number }[]
}

const DAY_MS = 86_400_000

export function snapshotFromRecords(records: SkillRecord[], now: Date): StarSnapshot {
  const repos = new Map<string, number>()
  for (const record of records) {
    if (record.source.kind === "local" || !record.source.repo) continue
    repos.set(record.source.repo, Math.max(repos.get(record.source.repo) ?? 0, record.signals.stars))
  }
  return { version: 1, date: now.toISOString(), repos: Object.fromEntries([...repos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) }
}

export function selectBaseline(snapshots: StarSnapshot[], now: Date, days: number): StarSnapshot | undefined {
  const cutoff = now.getTime() - days * DAY_MS
  const eligible = snapshots.filter((snapshot) => Date.parse(snapshot.date) <= cutoff)
  if (eligible.length === 0) return undefined
  return eligible.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0]
}

export function computeTrending(records: SkillRecord[], opts: { snapshots: StarSnapshot[]; now: Date; limit?: number }): TrendingFile {
  const current = snapshotFromRecords(records, opts.now)
  const baseline7 = selectBaseline(opts.snapshots, opts.now, 7)
  const baseline30 = selectBaseline(opts.snapshots, opts.now, 30)

  const bestByRepo = new Map<string, SkillRecord>()
  for (const record of records) {
    if (record.source.kind === "local" || !record.source.repo || record.status !== "candidate") continue
    const existing = bestByRepo.get(record.source.repo)
    if (!existing || record.scores.total > existing.scores.total) bestByRepo.set(record.source.repo, record)
  }

  const topVelocity: TrendingEntry[] = [...bestByRepo.entries()]
    .map(([repo, record]) => {
      const stars = current.repos[repo] ?? record.signals.stars
      return {
        id: record.id,
        repo,
        stars,
        delta7d: Math.max(0, stars - (baseline7?.repos[repo] ?? stars)),
        delta30d: Math.max(0, stars - (baseline30?.repos[repo] ?? stars)),
      }
    })
    .filter((entry) => entry.delta7d > 0 || entry.delta30d > 0)
    .sort((a, b) => b.delta7d - a.delta7d || b.delta30d - a.delta30d || b.stars - a.stars || a.repo.localeCompare(b.repo))
    .slice(0, opts.limit ?? 20)

  const newThisMonth = records
    .filter((record) => {
      if (record.status !== "candidate" || record.source.kind === "local" || !record.source.repo) return false
      const created = record.signals.createdAt ? Date.parse(record.signals.createdAt) : Number.NaN
      return Number.isFinite(created) && opts.now.getTime() - created <= 30 * DAY_MS
    })
    .map((record) => ({ id: record.id, repo: record.source.repo!, createdAt: record.signals.createdAt!, stars: record.signals.stars }))
    .sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id))
    .slice(0, 10)

  return { version: 1, generatedAt: opts.now.toISOString(), topVelocity, newThisMonth }
}

export function writeSnapshot(dir: string, snapshot: StarSnapshot): string {
  const snapshotsDir = join(dir, "snapshots")
  const path = join(snapshotsDir, `${snapshot.date.slice(0, 10)}.json`)
  mkdirSync(snapshotsDir, { recursive: true })
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n")
  return path
}

export function readSnapshots(dir: string): StarSnapshot[] {
  const snapshotsDir = join(dir, "snapshots")
  if (!existsSync(snapshotsDir)) return []
  return readdirSync(snapshotsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(snapshotsDir, name), "utf8")) as StarSnapshot)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}
```

- [ ] **Step 4: Run trending tests to verify they pass**

Run: `npx vitest run packages/catalog/test/trending.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Add the CLI formatter + command (write the failing test case first)**

Append to `packages/cli/test/depth-commands.test.ts`:

```ts
import { formatTrending, readTrending } from "../src/commands/depth.ts"

describe("trending command helpers", () => {
  it("formats velocity entries and reads the artifact", () => {
    const l = layout(mkdtempSync(join(tmpdir(), "skillhub-cli-trend-")))
    mkdirSync(l.catalogDir, { recursive: true })
    writeFileSync(
      join(l.catalogDir, "trending.json"),
      JSON.stringify({ version: 1, generatedAt: "2026-10-05T00:00:00Z", topVelocity: [{ id: "a/x", repo: "acme/skills", stars: 100, delta7d: 20, delta30d: 50 }], newThisMonth: [] }),
    )
    const file = readTrending(l)
    expect(file?.topVelocity).toHaveLength(1)
    expect(formatTrending(file!)).toContain("+20/7d")
    expect(formatTrending(file!)).toContain("acme/skills")
  })
})
```

Run: `npx vitest run packages/cli/test/depth-commands.test.ts`
Expected: FAIL — `readTrending`/`formatTrending` not exported.

- [ ] **Step 6: Implement the formatter + command**

Append to `packages/cli/src/commands/depth.ts` (first extend the existing `node:fs` import to `import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"`):

```ts
import type { TrendingFile } from "../../../catalog/src/trending.ts"

export function readTrending(l: StoreLayout): TrendingFile | undefined {
  const path = join(l.catalogDir, "trending.json")
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, "utf8")) as TrendingFile
}

export function formatTrending(file: TrendingFile): string {
  const lines = [`SkillHub trending — ${file.generatedAt}`]
  if (file.topVelocity.length === 0) lines.push("  (no velocity data yet — trends build from daily snapshots)")
  for (const entry of file.topVelocity) {
    lines.push(`  ${entry.repo} [${entry.stars}] +${entry.delta7d}/7d +${entry.delta30d}/30d — ${entry.id}`)
  }
  if (file.newThisMonth.length > 0) {
    lines.push("  new this month:")
    for (const entry of file.newThisMonth) lines.push(`    ${entry.id} (${entry.repo}, ${entry.stars} stars)`)
  }
  return lines.join("\n")
}
```

In `packages/cli/src/bin.ts` add `formatTrending, readTrending` to the depth import and:

```ts
program
  .command("trending")
  .option("--json", "machine-readable output")
  .action((opts: { json?: boolean }) => {
    const file = readTrending(store())
    if (!file) throw new Error("no trending.json in the store catalog — run `npm run catalog:sync` first")
    console.log(opts.json ? JSON.stringify(file, null, 2) : formatTrending(file))
  })
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run packages/catalog/test/trending.test.ts packages/cli/test/depth-commands.test.ts && npm run typecheck`
Expected: all pass; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add packages/catalog/src/trending.ts packages/catalog/test/trending.test.ts packages/cli/src/commands/depth.ts packages/cli/src/bin.ts packages/cli/test/depth-commands.test.ts
git commit -m "feat(catalog): star-snapshot trending with CLI surface"
```

---

### Task 7: Reconciliation + review queue

**Files:**
- Create: `packages/catalog/src/reconcile.ts`
- Test: `packages/catalog/test/reconcile.test.ts`

**Interfaces:**
- Produces:
  - `type SourceStat = { source: string; candidates: number; fetchedAt: string; error?: string }`
  - `type ReconciliationFile = { version: 1; generatedAt; totals: { previous; current; added: string[]; removed: string[]; changed: string[] }; sources: SourceStat[]; gaps: string[]; reviewQueue: string[] }`
  - `reconcile({ previous?: { skills: SkillRecord[] }; current: SkillRecord[]; sourceStats: SourceStat[]; now: Date; reviewMinScore?: number; reviewLimit?: number }): ReconciliationFile`
  - Gap rules: emptied catalog; >100% growth vs previous; one gap line per source error. Review queue = added candidate ids with `scores.total >= 60`, top 20.

- [ ] **Step 1: Write the failing tests**

`packages/catalog/test/reconcile.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { reconcile } from "../src/reconcile.ts"
import { makeRecord } from "./helpers.ts"

const now = new Date("2026-10-05T00:00:00Z")
const rec = (id: string, hash: string, total = 70) => makeRecord({ id, contentHash: hash, scores: { ...makeRecord({ id }).scores, total } })

describe("reconcile", () => {
  it("diffs ids and hashes, builds a review queue, and sorts sources", () => {
    const file = reconcile({
      previous: { skills: [rec("a/same", "h1"), rec("a/changed", "h2"), rec("a/removed", "h3")] },
      current: [rec("a/same", "h1"), rec("a/changed", "h9"), rec("a/added", "h4", 80), rec("a/low", "h5", 40)],
      sourceStats: [
        { source: "github:agent-skills", candidates: 3, fetchedAt: now.toISOString() },
        { source: "agentskills", candidates: 0, fetchedAt: now.toISOString(), error: "rate limited" },
      ],
      now,
    })
    expect(file.totals).toMatchObject({ previous: 3, current: 4, added: ["a/added", "a/low"], removed: ["a/removed"], changed: ["a/changed"] })
    expect(file.reviewQueue).toEqual(["a/added"])
    expect(file.gaps).toEqual(["source agentskills: rate limited"])
    expect(file.sources.map((s) => s.source)).toEqual(["agentskills", "github:agent-skills"])
  })

  it("flags a catalog that emptied", () => {
    const file = reconcile({ previous: { skills: [rec("a/x", "h")] }, current: [], sourceStats: [], now })
    expect(file.gaps).toContain("catalog emptied since the previous run")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/reconcile.test.ts`
Expected: FAIL — cannot resolve `../src/reconcile.ts`.

- [ ] **Step 3: Write reconcile.ts**

`packages/catalog/src/reconcile.ts`:

```ts
import type { SkillRecord } from "./types.ts"

export type SourceStat = { source: string; candidates: number; fetchedAt: string; error?: string }

export type ReconciliationFile = {
  version: 1
  generatedAt: string
  totals: { previous: number; current: number; added: string[]; removed: string[]; changed: string[] }
  sources: SourceStat[]
  gaps: string[]
  reviewQueue: string[]
}

export function reconcile(input: {
  previous?: { skills: SkillRecord[] }
  current: SkillRecord[]
  sourceStats: SourceStat[]
  now: Date
  reviewMinScore?: number
  reviewLimit?: number
}): ReconciliationFile {
  const previousSkills = input.previous?.skills ?? []
  const previousById = new Map(previousSkills.map((s) => [s.id, s]))
  const currentById = new Map(input.current.map((s) => [s.id, s]))

  const added = input.current.filter((s) => !previousById.has(s.id)).map((s) => s.id).sort()
  const removed = previousSkills.filter((s) => !currentById.has(s.id)).map((s) => s.id).sort()
  const changed = input.current
    .filter((s) => {
      const previous = previousById.get(s.id)
      return previous !== undefined && previous.contentHash !== s.contentHash
    })
    .map((s) => s.id)
    .sort()

  const gaps: string[] = []
  if (input.previous && input.current.length === 0 && previousSkills.length > 0) gaps.push("catalog emptied since the previous run")
  if (input.previous && previousSkills.length > 0 && added.length > previousSkills.length) {
    gaps.push(`catalog grew by more than 100% (${previousSkills.length} -> ${input.current.length}) — verify intake`)
  }
  for (const stat of input.sourceStats) if (stat.error) gaps.push(`source ${stat.source}: ${stat.error}`)

  const reviewMinScore = input.reviewMinScore ?? 60
  const reviewLimit = input.reviewLimit ?? 20
  const addedSet = new Set(added)
  const reviewQueue = input.current
    .filter((s) => addedSet.has(s.id) && s.status === "candidate" && s.scores.total >= reviewMinScore)
    .sort((a, b) => b.scores.total - a.scores.total || a.id.localeCompare(b.id))
    .slice(0, reviewLimit)
    .map((s) => s.id)

  return {
    version: 1,
    generatedAt: input.now.toISOString(),
    totals: { previous: previousSkills.length, current: input.current.length, added, removed, changed },
    sources: [...input.sourceStats].sort((a, b) => a.source.localeCompare(b.source)),
    gaps,
    reviewQueue,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/catalog/test/reconcile.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/catalog/src/reconcile.ts packages/catalog/test/reconcile.test.ts
git commit -m "feat(catalog): reconciliation diff, source gaps, and review queue"
```

---

### Task 8: Live sources — pagination, rate limits, concurrency, taxonomy

**Files:**
- Create: `packages/catalog/src/sources/util.ts`, `packages/catalog/src/taxonomy.ts`
- Modify: `packages/catalog/src/sources/types.ts`, `packages/catalog/src/sources/github.ts`, `packages/catalog/src/sources/agentskills.ts`
- Test: `packages/catalog/test/taxonomy.test.ts`, `packages/catalog/test/sources.test.ts` (extend)

**Interfaces:**
- Produces:
  - `FetchLike` response gains optional `headers?: { get(name: string): string | null }` (existing fakes stay valid).
  - `class RateLimitError extends Error { resetAt: string | null }`; `mapLimit<T,R>(items, limit, fn): Promise<R[]>` (order-preserving, bounded concurrency).
  - `CATEGORIES` (12 canonical ids), `mapCategory(raw: string | undefined, fallback?: Category): Category`.
  - `searchReposByTopic` gains `page?` and returns `defaultBranch`; throws `RateLimitError` on 403/429 with `x-ratelimit-remaining: 0`.
  - `fetchRepoSkills` gains `maxSkills?`, `maxFileBytes?` (default 256 KiB), `concurrency?` (default 4); skips oversized files and >50-file dirs; dirs fetched with `mapLimit`.

- [ ] **Step 1: Write the failing taxonomy + util tests**

`packages/catalog/test/taxonomy.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { CATEGORIES, mapCategory } from "../src/taxonomy.ts"

describe("mapCategory", () => {
  it("maps marketplace labels to canonical categories", () => {
    expect(mapCategory("Developer Tools")).toBe("engineering")
    expect(mapCategory("content")).toBe("writing")
    expect(mapCategory("Infrastructure")).toBe("infrastructure-devops")
  })
  it("falls back for unknown or missing labels", () => {
    expect(mapCategory(undefined)).toBe("engineering")
    expect(mapCategory("nonsense")).toBe("engineering")
    expect(mapCategory("nonsense", "research")).toBe("research")
  })
  it("exposes exactly the canonical categories", () => {
    expect(CATEGORIES).toHaveLength(12)
    expect(new Set(CATEGORIES).size).toBe(12)
  })
})
```

Add to `packages/catalog/test/sources.test.ts`:

```ts
import { RateLimitError, mapLimit } from "../src/sources/util.ts"
import { searchReposByTopic } from "../src/sources/github.ts"

describe("github adapter upgrades", () => {
  it("returns default branches and licenses from topic search", async () => {
    const fetchThing = (async () =>
      new Response(
        JSON.stringify({
          items: [{ full_name: "acme/skills", default_branch: "main", stargazers_count: 12, forks_count: 3, pushed_at: "2026-09-01T00:00:00Z", created_at: "2025-01-01T00:00:00Z", archived: false, license: { spdx_id: "MIT" } }],
        }),
        { status: 200 },
      )) as unknown as Parameters<typeof searchReposByTopic>[0]["fetchImpl"]
    const hits = await searchReposByTopic({ topic: "claude-skills", fetchImpl: fetchThing })
    expect(hits[0]).toMatchObject({ repo: "acme/skills", defaultBranch: "main", license: "MIT", archived: false })
  })

  it("throws RateLimitError when GitHub reports exhausted quota", async () => {
    const fetchThing = (async () =>
      new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "123" } })) as unknown as Parameters<typeof searchReposByTopic>[0]["fetchImpl"]
    await expect(searchReposByTopic({ topic: "x", fetchImpl: fetchThing })).rejects.toBeInstanceOf(RateLimitError)
  })
})

describe("mapLimit", () => {
  it("preserves order and respects the concurrency limit", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return n * 2
    })
    expect(out).toEqual([2, 4, 6, 8, 10])
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })
})
```

Also add to the existing agentskills test in the same file:

```ts
    expect(candidates[0]?.categoryHint).toBe("writing")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/taxonomy.test.ts packages/catalog/test/sources.test.ts`
Expected: FAIL — cannot resolve `../src/taxonomy.ts` / `../src/sources/util.ts`.

- [ ] **Step 3: Write taxonomy.ts and sources/util.ts**

`packages/catalog/src/taxonomy.ts`:

```ts
export const CATEGORIES = [
  "engineering",
  "testing",
  "design-ui",
  "writing",
  "data",
  "research",
  "marketing-growth",
  "business-finance",
  "docs-productivity",
  "security",
  "media-creative",
  "infrastructure-devops",
] as const

export type Category = (typeof CATEGORIES)[number]

const RAW_MAP: Record<string, Category> = {
  "developer tools": "engineering",
  developer: "engineering",
  engineering: "engineering",
  testing: "testing",
  qa: "testing",
  design: "design-ui",
  ui: "design-ui",
  "design & ui": "design-ui",
  writing: "writing",
  content: "writing",
  copywriting: "writing",
  data: "data",
  "data science": "data",
  research: "research",
  science: "research",
  marketing: "marketing-growth",
  growth: "marketing-growth",
  seo: "marketing-growth",
  business: "business-finance",
  finance: "business-finance",
  legal: "business-finance",
  productivity: "docs-productivity",
  documentation: "docs-productivity",
  docs: "docs-productivity",
  security: "security",
  media: "media-creative",
  creative: "media-creative",
  video: "media-creative",
  devops: "infrastructure-devops",
  infrastructure: "infrastructure-devops",
  cloud: "infrastructure-devops",
}

export function mapCategory(raw: string | undefined, fallback: Category = "engineering"): Category {
  if (!raw) return fallback
  const key = raw.trim().toLowerCase()
  if ((CATEGORIES as readonly string[]).includes(key)) return key as Category
  return RAW_MAP[key] ?? fallback
}
```

`packages/catalog/src/sources/util.ts`:

```ts
export class RateLimitError extends Error {
  constructor(readonly resetAt: string | null) {
    super(resetAt ? `rate limited until ${resetAt}` : "rate limited")
  }
}

/** Run `fn` over items with at most `limit` concurrent calls; preserves input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}
```

- [ ] **Step 4: Extend FetchLike and rewrite github.ts**

In `packages/catalog/src/sources/types.ts`, replace the `FetchLike` type with:

```ts
export type FetchLike = (
  url: string,
) => Promise<{
  ok: boolean
  status: number
  headers?: { get(name: string): string | null }
  arrayBuffer(): Promise<ArrayBuffer>
  json(): Promise<unknown>
}>
```

Rewrite `packages/catalog/src/sources/github.ts`:

```ts
import type { Candidate, CandidateFile, FetchLike } from "./types.ts"
import { mapLimit, RateLimitError } from "./util.ts"

const headers = (token?: string) => ({
  accept: "application/vnd.github+json",
  "user-agent": "skillhub-phase3",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
})

const isRateLimited = (res: { status: number; headers?: { get(name: string): string | null } }): boolean =>
  (res.status === 403 || res.status === 429) && res.headers?.get("x-ratelimit-remaining") === "0"

const checkRateLimit = (res: { status: number; headers?: { get(name: string): string | null } }): void => {
  if (isRateLimited(res)) throw new RateLimitError(res.headers?.get("x-ratelimit-reset") ?? null)
}

export type RepoSearchHit = {
  repo: string
  defaultBranch: string
  signals: Record<string, number | string | boolean | null>
  license?: string
  archived: boolean
}

export async function searchReposByTopic(opts: {
  topic: string
  token?: string
  fetchImpl: FetchLike
  limit?: number
  page?: number
}): Promise<RepoSearchHit[]> {
  const limit = opts.limit ?? 50
  const page = opts.page ?? 1
  const url = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(opts.topic)}&per_page=${Math.min(100, limit)}&page=${page}&sort=stars&order=desc`
  const res = await (opts.fetchImpl as unknown as typeof fetch)(url, { headers: headers(opts.token) })
  checkRateLimit(res)
  if (!res.ok) throw new Error(`github search failed: ${res.status}`)
  const body = (await res.json()) as { items: any[] }
  return body.items.slice(0, limit).map((item) => ({
    repo: item.full_name as string,
    defaultBranch: (item.default_branch as string | undefined) ?? "HEAD",
    signals: {
      stars: item.stargazers_count ?? 0,
      forks: item.forks_count ?? 0,
      pushedAt: item.pushed_at ?? null,
      createdAt: item.created_at ?? null,
      archived: Boolean(item.archived),
    },
    license: item.license?.spdx_id && item.license.spdx_id !== "NOASSERTION" ? item.license.spdx_id : undefined,
    archived: Boolean(item.archived),
  }))
}

export async function fetchRepoSkills(opts: {
  repo: string
  ref: string
  token?: string
  fetchImpl: FetchLike
  license?: string
  maxSkills?: number
  maxFileBytes?: number
  concurrency?: number
}): Promise<Candidate[]> {
  const api = async <T>(url: string): Promise<T> => {
    const res = await (opts.fetchImpl as unknown as typeof fetch)(url, { headers: headers(opts.token) })
    checkRateLimit(res)
    if (!res.ok) throw new Error(`github ${url} -> ${res.status}`)
    return (await res.json()) as T
  }

  const tree = await api<{ tree: { path: string; type: string; size?: number; sha: string }[]; sha: string }>(
    `https://api.github.com/repos/${opts.repo}/git/trees/${opts.ref}?recursive=1`,
  )
  const allDirs = [
    ...new Set(tree.tree.filter((node) => node.type === "blob" && node.path.endsWith("/SKILL.md")).map((node) => node.path.slice(0, -"/SKILL.md".length))),
  ]
  const dirs = typeof opts.maxSkills === "number" ? allDirs.slice(0, opts.maxSkills) : allDirs
  const maxBytes = opts.maxFileBytes ?? 262_144
  const concurrency = opts.concurrency ?? 4

  const results = await mapLimit(dirs, concurrency, async (dir): Promise<Candidate | undefined> => {
    const paths = tree.tree.filter((node) => node.type === "blob" && node.path.startsWith(`${dir}/`)).map((node) => node.path)
    if (paths.length > 50) return undefined
    const files: CandidateFile[] = []
    for (const path of paths) {
      const res = await (opts.fetchImpl as unknown as typeof fetch)(`https://raw.githubusercontent.com/${opts.repo}/${tree.sha}/${path}`, {
        headers: headers(opts.token),
      })
      if (!res.ok) throw new Error(`raw fetch failed for ${path}`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength > maxBytes) continue
      files.push({ path, bytes, content: new TextDecoder().decode(bytes), size: bytes.byteLength })
    }
    if (!files.some((file) => file.path.endsWith("SKILL.md") && file.content)) return undefined
    return {
      source: { kind: "github", repo: opts.repo, path: `${dir}/SKILL.md`, ref: tree.sha, license: opts.license, licenseFlags: [] },
      name: dir.split("/").at(-1) ?? dir,
      dir,
      tags: dir.split("/").slice(0, -1).slice(-2),
      signals: {},
      files,
    }
  })
  return results.filter((candidate): candidate is Candidate => candidate !== undefined)
}
```

- [ ] **Step 5: Map agentskills categories**

In `packages/catalog/src/sources/agentskills.ts`, import `mapCategory` from `../taxonomy.ts` and add `categoryHint: mapCategory(item.category)` to the pushed candidate object.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/catalog/test/taxonomy.test.ts packages/catalog/test/sources.test.ts && npm run typecheck`
Expected: all pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/catalog/src/taxonomy.ts packages/catalog/src/sources
git add packages/catalog/test/taxonomy.test.ts packages/catalog/test/sources.test.ts
git commit -m "feat(catalog): live source hardening — taxonomy, rate limits, pagination, concurrency"
```

---

### Task 9: Sync orchestrator + `catalog:sync` CLI + artifact/search.db updates

**Files:**
- Create: `packages/catalog/src/sync.ts`, `packages/catalog/src/sync-bin.ts`
- Modify: `packages/catalog/src/build.ts` (extract `normalizeAll`), `packages/catalog/src/publish.ts` (extras + search.db columns)
- Modify: `package.json` (add `catalog:sync` script)
- Test: `packages/catalog/test/sync.test.ts`, `packages/catalog/test/publish.test.ts` (extend), `packages/catalog/test/build.test.ts` (must stay green)

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces:
  - `normalizeAll(candidates, { now; maxIdleMonths? }): { records: SkillRecord[]; rejected: { name; reason }[]; bodies: Map<string, string> }` in `build.ts`; `buildCatalog` keeps its exact current signature/summary.
  - `writeCatalog(records, outDir, now, extras?: { trending?: TrendingFile; reconciliation?: ReconciliationFile })`; `search.db` gains `cluster TEXT` and `requires TEXT` (JSON) columns.
  - `syncCatalog(opts): Promise<SyncResult>` — sources (per-source error isolation) → normalize → evaluate (optional) → refine clusters → trending from snapshots → reconcile → publish → persist eval cache, cluster state, today's snapshot.
  - `type SyncSource = { name: string; load: () => Promise<Candidate[]> }`; `type SyncSummary`/`SyncResult` fields as listed in the code below.
  - `catalog:sync` bin with flags `--fixtures --topics --max-repos --max-skills --agentskills --agentskills-limit --out --state --llm --max-evals --max-usd --llm-model --llm-base-url`; `--llm` refuses without `--max-usd > 0` and a key.

- [ ] **Step 1: Write the failing sync test**

`packages/catalog/test/sync.test.ts`:

```ts
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { RubricEvaluation } from "../src/rubric.ts"
import type { Candidate } from "../src/sources/types.ts"
import { syncCatalog } from "../src/sync.ts"

const now = new Date("2026-10-05T00:00:00Z")
const qualityOnly = { quality: 1, trust: 0, freshness: 0, compatibility: 0, adoption: 0 }

const skill = (name: string, repo: string): Candidate => {
  const body = `---\nname: ${name}\ndescription: A skill for ${name}. Use when testing.\n---\n\n# ${name}\n\n## When to use\n\nUse when testing.\n\n## Workflow\n\n1. Do it.\n\n\`\`\`bash\necho ok\n\`\`\`\n`
  return {
    source: { kind: "github", repo, path: `${name}/SKILL.md`, ref: "abc123", license: "MIT", licenseFlags: [] },
    name,
    dir: name,
    tags: [name.split("-")[0]!],
    signals: { stars: 10, pushedAt: "2026-09-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
    files: [{ path: `${name}/SKILL.md`, content: body, size: Buffer.byteLength(body) }],
  }
}

const evaluation = (score: number): RubricEvaluation => ({
  result: {
    score,
    dimensions: { triggers: score, clarity: score, structure: score, completeness: score, scope: score, examples: score, safety: score },
    reasoning: "ok",
    flags: [],
  },
  usage: { inputTokens: 100, outputTokens: 10 },
  costUsd: 0.001,
  model: "m",
})

describe("syncCatalog", () => {
  it("runs sources -> evaluate -> cluster -> trend -> reconcile -> publish", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-sync-"))
    const outDir = join(root, "catalog")
    const stateDir = join(root, "state")
    const evaluatedIds: string[] = []

    const result = await syncCatalog({
      sources: [
        { name: "fixtures", load: async () => [skill("pdf-tool", "acme/skills"), skill("pdf-tool", "beta/skills"), skill("k8s-tool", "acme/skills")] },
        { name: "broken-source", load: async () => { throw new Error("boom") } },
      ],
      outDir,
      stateDir,
      now,
      weights: qualityOnly,
      evaluation: {
        evaluate: async (input) => {
          evaluatedIds.push(input.id)
          return evaluation(88)
        },
        maxEvals: 2,
        maxUsd: 1,
      },
    })

    expect(result.summary).toMatchObject({ candidates: 3, published: 3, rejected: 0, evaluated: 2, cached: 0, skippedBudget: 1, duplicates: 1 })
    expect(evaluatedIds).toEqual(["acme-skills/pdf-tool", "beta-skills/pdf-tool"])
    expect(result.index.skills.find((s) => s.id === "acme-skills/pdf-tool")!.scores.total).toBe(88)
    expect(result.index.skills.find((s) => s.id === "acme-skills/pdf-tool")!.relations.duplicates).toEqual(["beta-skills/pdf-tool"])
    expect(result.reconciliation.gaps).toEqual(["source broken-source: boom"])
    expect(result.reconciliation.reviewQueue).toContain("acme-skills/pdf-tool")
    expect(result.trending.topVelocity).toEqual([])
    expect(existsSync(join(outDir, "index.json"))).toBe(true)
    expect(existsSync(join(outDir, "trending.json"))).toBe(true)
    expect(existsSync(join(outDir, "reconciliation.json"))).toBe(true)
    expect(existsSync(join(stateDir, "eval-cache.json"))).toBe(true)
    expect(existsSync(join(stateDir, "clusters-state.json"))).toBe(true)
    expect(existsSync(join(stateDir, "snapshots", "2026-10-05.json"))).toBe(true)
  })

  it("serves the eval cache on a second run (delta-only)", async () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-sync2-"))
    const outDir = join(root, "catalog")
    const stateDir = join(root, "state")
    const sources = [{ name: "fixtures", load: async () => [skill("pdf-tool", "acme/skills"), skill("k8s-tool", "acme/skills")] }]
    await syncCatalog({ sources, outDir, stateDir, now, weights: qualityOnly, evaluation: { evaluate: async () => evaluation(70), maxEvals: 5, maxUsd: 1 } })
    const second = await syncCatalog({
      sources,
      outDir,
      stateDir,
      now,
      weights: qualityOnly,
      evaluation: {
        evaluate: async () => {
          throw new Error("evaluator must not run on cached content")
        },
        maxEvals: 0,
        maxUsd: 1,
      },
    })
    expect(second.summary).toMatchObject({ evaluated: 0, cached: 2, skippedBudget: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/catalog/test/sync.test.ts`
Expected: FAIL — cannot resolve `../src/sync.ts`.

- [ ] **Step 3: Extract normalizeAll and extend publish.ts**

In `packages/catalog/src/build.ts`, add and use:

```ts
export function normalizeAll(
  candidates: Candidate[],
  opts: { now: Date; maxIdleMonths?: number },
): { records: SkillRecord[]; rejected: BuildSummary["rejected"]; bodies: Map<string, string> } {
  const records: SkillRecord[] = []
  const rejected: BuildSummary["rejected"] = []
  const bodies = new Map<string, string>()
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const result = normalizeCandidate(candidate, { now: opts.now, maxIdleMonths: opts.maxIdleMonths })
    if (result.record) {
      if (seen.has(result.record.id)) {
        rejected.push({ name: candidate.name, reason: `duplicate id ${result.record.id}` })
        continue
      }
      seen.add(result.record.id)
      records.push(result.record)
      if (result.body !== undefined) bodies.set(result.record.id, result.body)
    } else if (result.rejected) {
      rejected.push({ name: candidate.name, reason: result.rejected.reason })
    }
  }
  return { records, rejected, bodies }
}
```

`buildCatalog` becomes:

```ts
export function buildCatalog(opts: { candidates: Candidate[]; outDir: string; now?: Date }): {
  summary: BuildSummary
  index: CatalogIndex
} {
  const now = opts.now ?? new Date()
  const { records, rejected } = normalizeAll(opts.candidates, { now })
  const index = writeCatalog(records, opts.outDir, now).index
  return {
    summary: {
      total: opts.candidates.length,
      published: records.filter((r) => r.status === "candidate").length,
      quarantined: records.filter((r) => r.status === "quarantined").length,
      rejected,
    },
    index,
  }
}
```

In `packages/catalog/src/publish.ts`:
- add imports: `import type { ReconciliationFile } from "./reconcile.ts"` and `import type { TrendingFile } from "./trending.ts"`
- change the signature to `writeCatalog(records, outDir, now, extras?: { trending?: TrendingFile; reconciliation?: ReconciliationFile })` and after writing `clusters.json`:

```ts
  if (extras?.trending) writeFileSync(join(outDir, "trending.json"), JSON.stringify(extras.trending, null, 2) + "\n")
  if (extras?.reconciliation) writeFileSync(join(outDir, "reconciliation.json"), JSON.stringify(extras.reconciliation, null, 2) + "\n")
```

- `buildSearchDb` schema and inserts:

```ts
  db.exec(
    "CREATE TABLE skills (id TEXT PRIMARY KEY, name TEXT, description TEXT, category TEXT, total REAL, risk TEXT, provenance TEXT, status TEXT, cluster TEXT, requires TEXT)",
  )
```

```ts
    insert.run(
      record.id, record.name, record.description, record.category, record.scores.total, record.risk.level,
      record.provenanceTier, record.status, record.clusterId, JSON.stringify(record.requires),
    )
```

- [ ] **Step 4: Write sync.ts and sync-bin.ts**

`packages/catalog/src/sync.ts`:

```ts
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { BuildSummary } from "./build.ts"
import { normalizeAll } from "./build.ts"
import { composeTotal } from "./calibrate.ts"
import { readClusterState, refineClusters, writeClusterState, type ClusterState } from "./cluster-refine.ts"
import type { Embedder } from "./embed.ts"
import { readEvalCache, writeEvalCache } from "./eval-cache.ts"
import { evaluateRecords, type EvaluateFn, type EvaluateStats } from "./evaluate.ts"
import { writeCatalog, type CatalogIndex } from "./publish.ts"
import { reconcile, type ReconciliationFile, type SourceStat } from "./reconcile.ts"
import type { ScoreWeights } from "./score.ts"
import type { Candidate } from "./sources/types.ts"
import { computeTrending, readSnapshots, snapshotFromRecords, writeSnapshot, type TrendingFile } from "./trending.ts"
import type { SkillRecord } from "./types.ts"

export type SyncSource = { name: string; load: () => Promise<Candidate[]> }

export type SyncSummary = {
  candidates: number
  published: number
  quarantined: number
  rejected: number
  evaluated: number
  cached: number
  skippedBudget: number
  spentUsd: number
  duplicates: number
}

export type SyncResult = {
  summary: SyncSummary
  index: CatalogIndex
  trending: TrendingFile
  reconciliation: ReconciliationFile
  clusterState: ClusterState
  evalStats?: EvaluateStats
}

const readIndex = (outDir: string): CatalogIndex | undefined => {
  const path = join(outDir, "index.json")
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, "utf8")) as CatalogIndex
}

const rescoreAll = (records: SkillRecord[], weights: ScoreWeights): SkillRecord[] =>
  records.map((record) => ({ ...record, scores: { ...record.scores, total: composeTotal(record.scores, weights) } }))

export async function syncCatalog(opts: {
  sources: SyncSource[]
  outDir: string
  stateDir: string
  now?: Date
  weights?: ScoreWeights
  evaluation?: { evaluate: EvaluateFn; maxEvals?: number; maxUsd?: number; costPerEvalUsd?: number }
  cluster?: { k?: number; seed?: number; dupThreshold?: number }
  embed?: Embedder
}): Promise<SyncResult> {
  const now = opts.now ?? new Date()
  const sourceStats: SourceStat[] = []
  const candidates: Candidate[] = []

  for (const source of opts.sources) {
    try {
      const loaded = await source.load()
      candidates.push(...loaded)
      sourceStats.push({ source: source.name, candidates: loaded.length, fetchedAt: now.toISOString() })
    } catch (error) {
      sourceStats.push({
        source: source.name,
        candidates: 0,
        fetchedAt: now.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const { records, rejected, bodies } = normalizeAll(candidates, { now })

  let evaluated: SkillRecord[] = records
  let evalStats: EvaluateStats | undefined
  if (opts.evaluation) {
    const cacheFile = join(opts.stateDir, "eval-cache.json")
    const result = await evaluateRecords(records, {
      cache: readEvalCache(cacheFile),
      evaluate: opts.evaluation.evaluate,
      bodies,
      maxEvals: opts.evaluation.maxEvals,
      maxUsd: opts.evaluation.maxUsd,
      costPerEvalUsd: opts.evaluation.costPerEvalUsd,
      weights: opts.weights,
      now,
    })
    evaluated = result.records
    evalStats = result.stats
    writeEvalCache(cacheFile, result.cache)
  } else if (opts.weights) {
    evaluated = rescoreAll(records, opts.weights)
  }

  const stateFile = join(opts.stateDir, "clusters-state.json")
  const refined = refineClusters(evaluated, {
    prev: readClusterState(stateFile),
    k: opts.cluster?.k,
    seed: opts.cluster?.seed,
    dupThreshold: opts.cluster?.dupThreshold,
    embed: opts.embed,
    now,
  })
  writeClusterState(stateFile, refined.state)

  const previousIndex = readIndex(opts.outDir)
  const trending = computeTrending(refined.records, { snapshots: readSnapshots(opts.stateDir), now })
  const reconciliation = reconcile({ previous: previousIndex, current: refined.records, sourceStats, now })
  const { index } = writeCatalog(refined.records, opts.outDir, now, { trending, reconciliation })
  writeSnapshot(opts.stateDir, snapshotFromRecords(refined.records, now))

  return {
    summary: {
      candidates: candidates.length,
      published: refined.records.filter((record) => record.status === "candidate").length,
      quarantined: refined.records.filter((record) => record.status === "quarantined").length,
      rejected: rejected.length,
      evaluated: evalStats?.evaluated ?? 0,
      cached: evalStats?.cached ?? 0,
      skippedBudget: evalStats?.skippedBudget ?? 0,
      spentUsd: evalStats?.spentUsd ?? 0,
      duplicates: refined.duplicates.length,
    },
    index,
    trending,
    reconciliation,
    clusterState: refined.state,
    evalStats,
  }
}
```

`packages/catalog/src/sync-bin.ts`:

```ts
import { existsSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { readCalibration } from "./calibrate.ts"
import { makeOpenAiCompatClient } from "./llm.ts"
import { makeRubricEvaluator } from "./rubric.ts"
import { fetchAgentskills } from "./sources/agentskills.ts"
import { loadFixtureCandidates } from "./sources/fixtures.ts"
import { fetchRepoSkills, searchReposByTopic } from "./sources/github.ts"
import type { Candidate, FetchLike } from "./sources/types.ts"
import { RateLimitError } from "./sources/util.ts"
import { syncCatalog, type SyncSource } from "./sync.ts"

const { values } = parseArgs({
  options: {
    fixtures: { type: "string" },
    topics: { type: "string" },
    "max-repos": { type: "string", default: "25" },
    "max-skills": { type: "string", default: "20" },
    agentskills: { type: "string" },
    "agentskills-limit": { type: "string", default: "50" },
    out: { type: "string", default: "catalog" },
    state: { type: "string" },
    llm: { type: "boolean", default: false },
    "max-evals": { type: "string", default: "0" },
    "max-usd": { type: "string", default: "0" },
    "llm-model": { type: "string" },
    "llm-base-url": { type: "string" },
  },
})

if (!values.fixtures && !values.topics && !values.agentskills) {
  console.error("usage: catalog:sync [--fixtures <dir>] [--topics a,b] [--agentskills <baseUrl>] [--llm --max-usd <usd> [--max-evals <n>]]")
  process.exit(2)
}

const fetchImpl = fetch as unknown as FetchLike
const stateDir = values.state ?? join(values.out, "state")

let evaluation: { evaluate: ReturnType<typeof makeRubricEvaluator>; maxEvals?: number; maxUsd: number } | undefined
if (values.llm) {
  const maxUsd = Number(values["max-usd"])
  if (!(maxUsd > 0)) {
    console.error("--llm requires a hard cost cap: pass --max-usd <usd>")
    process.exit(2)
  }
  const apiKey = process.env.SKILLHUB_LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    console.error("--llm requires SKILLHUB_LLM_API_KEY or DEEPSEEK_API_KEY")
    process.exit(2)
  }
  const baseUrl = values["llm-base-url"] ?? process.env.SKILLHUB_LLM_BASE_URL ?? "https://api.deepseek.com/v1"
  const model = values["llm-model"] ?? process.env.SKILLHUB_LLM_MODEL ?? "deepseek-chat"
  console.log(`llm: ${model} via ${baseUrl}; cap $${maxUsd}${values["max-evals"] !== "0" ? `, ${values["max-evals"]} evals` : ""}`)
  evaluation = { evaluate: makeRubricEvaluator(makeOpenAiCompatClient({ baseUrl, apiKey, model })), maxEvals: Number(values["max-evals"]) || undefined, maxUsd }
}

const sources: SyncSource[] = []

if (values.fixtures) {
  const dir = values.fixtures
  sources.push({ name: `fixtures:${dir}`, load: async () => loadFixtureCandidates(dir) })
}

if (values.topics) {
  const token = process.env.GITHUB_TOKEN
  for (const topic of values.topics.split(",").map((t) => t.trim()).filter(Boolean)) {
    sources.push({
      name: `github:${topic}`,
      load: async () => {
        const hits = await searchReposByTopic({ topic, token, fetchImpl, limit: Number(values["max-repos"]) })
        const out: Candidate[] = []
        for (const hit of hits) {
          if (hit.archived) continue
          try {
            out.push(...(await fetchRepoSkills({ repo: hit.repo, ref: hit.defaultBranch, token, fetchImpl, license: hit.license, maxSkills: Number(values["max-skills"]) })))
          } catch (error) {
            if (error instanceof RateLimitError) throw error
          }
        }
        return out
      },
    })
  }
}

if (values.agentskills) {
  const baseUrl = values.agentskills
  sources.push({ name: "agentskills", load: async () => fetchAgentskills({ baseUrl, fetchImpl, limit: Number(values["agentskills-limit"]) }) })
}

const calibrationPath = join(values.out, "calibration.json")
const weights = existsSync(calibrationPath) ? readCalibration(calibrationPath) : undefined
console.log(`sync: ${sources.length} source(s) -> ${values.out} (state ${stateDir})${weights ? "; calibrated weights applied" : ""}`)

const result = await syncCatalog({ sources, outDir: values.out, stateDir, weights, evaluation })
const summary = result.summary
console.log(`sync: ${summary.candidates} candidate(s) -> ${summary.published} published, ${summary.quarantined} quarantined, ${summary.rejected} rejected`)
console.log(`  evaluated ${summary.evaluated} (cached ${summary.cached}, budget-skipped ${summary.skippedBudget}, spend $${summary.spentUsd.toFixed(4)}), duplicates ${summary.duplicates}`)
console.log(`  added ${result.reconciliation.totals.added.length}, removed ${result.reconciliation.totals.removed.length}, changed ${result.reconciliation.totals.changed.length}`)
for (const gap of result.reconciliation.gaps) console.log(`  gap: ${gap}`)
```

Add to the root `package.json` scripts: `"catalog:sync": "node packages/catalog/src/sync-bin.ts"`.

- [ ] **Step 5: Add the publish.ts column test**

Append to `packages/catalog/test/publish.test.ts` (inside the existing `writeCatalog` describe):

```ts
  it("stores cluster and requires columns in search.db", () => {
    const out = mkdtempSync(join(tmpdir(), "skillhub-publish-cols-"))
    writeCatalog([makeRecord({ id: "acme/good", clusterId: "c-1234", requires: { runtime: ["python"], scripts: [], mcp: [], env: ["KEY"], services: [] } })], out, now)
    const db = new DatabaseSync(join(out, "search.db"))
    const row = db.prepare("SELECT cluster, requires FROM skills WHERE id = ?").get("acme/good") as { cluster: string; requires: string }
    expect(row.cluster).toBe("c-1234")
    expect(JSON.parse(row.requires).env).toEqual(["KEY"])
    db.close()
  })
```

- [ ] **Step 6: Run the full catalog suite + typecheck**

Run: `npx vitest run packages/catalog/test && npm run typecheck`
Expected: all pass, including the unchanged build/publish suites; typecheck clean.

- [ ] **Step 7: Smoke the sync bin offline**

Run: `npm run catalog:sync -- --fixtures fixtures/skills --out "$env:TEMP\skillhub-sync-smoke" --state "$env:TEMP\skillhub-sync-smoke\state"`
Expected: exit 0; prints published/quarantined/rejected counts, `trending.json` + `reconciliation.json` exist, no network access.

- [ ] **Step 8: Commit**

```bash
git add packages/catalog/src/sync.ts packages/catalog/src/sync-bin.ts packages/catalog/src/build.ts packages/catalog/src/publish.ts package.json packages/catalog/test/sync.test.ts packages/catalog/test/publish.test.ts
git commit -m "feat(catalog): sync orchestrator, catalog:sync CLI, trending/reconciliation artifacts"
```

---

### Task 10: Live-gated acceptance tests + spec status

**Files:**
- Create: `packages/catalog/test/live.test.ts`
- Modify: `docs/superpowers/specs/2026-10-05-skillhub-design.md` (§12 status, §7.3 target)
- Test: same + final full-suite run

**Interfaces:**
- Consumes: every prior task.
- Produces: `SKILLHUB_LIVE=1` gated tests that (a) ingest a couple of real GitHub topic repos + agentskills entries and run a full offline sync, and (b) `SKILLHUB_LIVE_LLM=1` + key gated tests that run one real rubric evaluation with a <$0.05 assertion. CI runs neither.

- [ ] **Step 1: Write live.test.ts**

`packages/catalog/test/live.test.ts`:

```ts
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
```

If the agentskills.codes host differs in practice, correct the URL constant here and record the actual endpoint in the execution report (the Phase 0 pattern: verify empirically, then pin).

- [ ] **Step 2: Run the always-on suite to prove the gates hold**

Run: `npx vitest run`
Expected: live tests report as skipped (or not run) without the env vars; full suite green; typecheck clean.

- [ ] **Step 3: Run the live source smoke (manual, network, no LLM)**

Run (PowerShell):

```powershell
$env:SKILLHUB_LIVE = "1"
npx vitest run packages/catalog/test/live.test.ts -t "ingests real"
Remove-Item Env:SKILLHUB_LIVE
```

Expected: pass; candidates > 0. If `GITHUB_TOKEN` is unset the topic search may hit the anonymous 60 req/hr limit — set it first when available.

- [ ] **Step 4: Run the live rubric smoke (manual, paid, capped)**

Run (PowerShell):

```powershell
$env:SKILLHUB_LIVE_LLM = "1"
npx vitest run packages/catalog/test/live.test.ts -t "evaluates one skill"
Remove-Item Env:SKILLHUB_LIVE_LLM
```

Expected: one evaluation, `costUsd < 0.05` asserted, score + model logged. Requires `DEEPSEEK_API_KEY` or `SKILLHUB_LLM_API_KEY`. **This is the only paid step in Phase 3; it must be run with `SKILLHUB_LIVE_LLM=1` explicitly and never in CI.**

- [ ] **Step 5: Update the spec status**

In `docs/superpowers/specs/2026-10-05-skillhub-design.md`:

Replace the Phase 3 roadmap row with:

```markdown
| **3 — Ranking depth** | LLM rubric + calibration, clusters/taxonomy, requirements extraction, trending, reconciliation, live sources | **Done 2026-10-05** — `catalog:sync` ingests live sources; rubric is delta-only + hard-capped; calibration improves on the bootstrap golden set (provisional target ρ ≥ 0.7; final target set by the user labeling session, see §7.3) |
```

And in §7.3, append to the golden-set bullet:

```markdown
  - Bootstrap golden set + `skillhub label export/import` + `skillhub calibrate --apply` shipped in Phase 3; the user labeling session (30–50 real skills) sets the final calibration target and applies the calibrated weights.
```

- [ ] **Step 6: Final full verification**

Run: `npm test && npm run typecheck`
Expected: 100% of non-live tests pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/catalog/test/live.test.ts docs/superpowers/specs/2026-10-05-skillhub-design.md
git commit -m "test(catalog): live-gated source/rubric smokes; document Phase 3 status"
```

---

## Acceptance

- [ ] `npm test` and `npm run typecheck` clean on Windows (this worktree) and the CI matrix (`ubuntu-latest` + `windows-latest`), with zero network and zero LLM calls.
- [ ] `npm run catalog:build -- --fixtures fixtures/skills` output is unchanged from Phase 2 (back-compat).
- [ ] `npm run catalog:sync -- --fixtures fixtures/skills` produces `index.json`, `clusters.json`, `trending.json`, `reconciliation.json`, `search.db` + state (eval cache only when evaluating; clusters state and snapshot always).
- [ ] Live: a small `catalog:sync --topics claude-skills --max-repos 2 --max-skills 2 --agentskills https://agentskills.codes --agentskills-limit 2` run ingests real candidates (record any endpoint corrections in the report).
- [ ] `--llm` without `--max-usd` exits non-zero; a live rubric evaluation stays under its cap; the eval cache makes the second run free (proven by `sync.test.ts`).
- [ ] SC4: `calibrateWeights` beats the default weights on a constructed misordered set (unit test) and on the bootstrap golden set; `skillhub calibrate --apply` writes `catalog/calibration.json`, which `catalog:sync` picks up automatically.
- [ ] The plugin's `searchRuntime` and the CLI's `searchSkills` continue to work against the new `search.db` without modification (existing e2e-plugin + cli tests stay green).
- [ ] Watch-items carried forward: user golden-set labeling session (30–50 real skills), `SKILLHUB_LLM_*` env documentation, and daily-CI catalog publishing (Phase 4).

## Open items handed to Phase 4

- Dashboard (`skillhub ui`): gallery/clusters/trending/review views over the new artifacts.
- Hosted catalog publishing (Pages/release assets) + `catalog-sync.yml` daily workflow; eval-cache as a CI cache or release asset instead of a committed file.
- Optional semantic embedder behind the existing `Embedder` interface (the local hashing embedder is the default).
- LLM cluster labeling (`labelClusters`) remains tag-derived until a labeled-cluster evaluation exists.

