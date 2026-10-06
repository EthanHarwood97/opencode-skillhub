import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { readCalibration } from "./calibrate.ts"
import { makeCurator, type CurateFn } from "./curate.ts"
import { makeGeminiEmbedder, type EmbeddingProvider } from "./embeddings.ts"
import { makeOpenAiCompatClient } from "./llm.ts"
import { makeRubricEvaluator } from "./rubric.ts"
import { fetchAgentskills } from "./sources/agentskills.ts"
import { loadFixtureCandidates } from "./sources/fixtures.ts"
import { fetchRepoSkills, searchReposByTopic } from "./sources/github.ts"
import { fetchSeedRepos, type SeedRepo } from "./sources/seeds.ts"
import type { Candidate, FetchLike } from "./sources/types.ts"
import { RateLimitError } from "./sources/util.ts"
import { syncCatalog, type SyncSource } from "./sync.ts"
import { TOPIC_HINTS } from "./taxonomy.ts"

const { values } = parseArgs({
  options: {
    fixtures: { type: "string" },
    topics: { type: "string" },
    "max-repos": { type: "string", default: "25" },
    "max-skills": { type: "string", default: "20" },
    pages: { type: "string", default: "1" },
    "min-stars": { type: "string", default: "0" },
    seeds: { type: "string" },
    "seed-limit": { type: "string", default: "0" },
    agentskills: { type: "string" },
    "agentskills-limit": { type: "string", default: "50" },
    out: { type: "string", default: "catalog" },
    state: { type: "string" },
    llm: { type: "boolean", default: false },
    "max-evals": { type: "string", default: "0" },
    "max-usd": { type: "string", default: "0" },
    "cost-per-eval": { type: "string", default: "0.002" },
    curate: { type: "boolean", default: false },
    "curate-max-items": { type: "string", default: "60" },
    "curate-max-usd": { type: "string", default: "0.25" },
    "curate-cost-per-item": { type: "string", default: "0.002" },
    "curate-ids": { type: "string" },
    "llm-model": { type: "string" },
    "llm-base-url": { type: "string" },
    "no-vectors": { type: "boolean", default: false },
  },
})

if (!values.fixtures && !values.topics && !values.agentskills && !values.seeds) {
  console.error("usage: catalog:sync [--fixtures <dir>] [--topics a,b] [--seeds <file>] [--agentskills <baseUrl>] [--llm --max-usd <usd> [--max-evals <n>]]")
  process.exit(2)
}

const fetchWithTimeout = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
  fetch(input, { ...init, signal: AbortSignal.timeout(45_000) })
const fetchImpl = fetchWithTimeout as unknown as FetchLike
const stateDir = values.state ?? join(values.out, "state")

let vectors: { embedder: EmbeddingProvider } | undefined
const vectorKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY
if (values["no-vectors"]) console.log("vectors: disabled by --no-vectors")
else if (vectorKey) {
  const embedder = makeGeminiEmbedder({ apiKey: vectorKey })
  vectors = { embedder }
  console.log(`vectors: ${embedder.model} @ ${embedder.dim} dims`)
} else console.log("vectors: skipped (no GOOGLE_API_KEY/GEMINI_API_KEY)")

let evaluation: { evaluate: ReturnType<typeof makeRubricEvaluator>; maxEvals?: number; maxUsd: number; costPerEvalUsd?: number } | undefined
let curation: { curate: CurateFn; maxItems?: number; maxUsd: number; costPerItemUsd?: number } | undefined
if (values.llm || values.curate) {
  if (values.llm && !(Number(values["max-usd"]) > 0)) {
    console.error("--llm requires a hard cost cap: pass --max-usd <usd>")
    process.exit(2)
  }
  if (values.curate && !(Number(values["curate-max-usd"]) > 0)) {
    console.error("--curate requires a hard cost cap: pass --curate-max-usd <usd>")
    process.exit(2)
  }
  const apiKey = process.env.SKILLHUB_LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    console.error("--llm/--curate requires SKILLHUB_LLM_API_KEY or DEEPSEEK_API_KEY")
    process.exit(2)
  }
  const baseUrl = values["llm-base-url"] ?? process.env.SKILLHUB_LLM_BASE_URL ?? "https://api.deepseek.com/v1"
  const model = values["llm-model"] ?? process.env.SKILLHUB_LLM_MODEL ?? "deepseek-chat"
  if (values.llm) {
    const maxUsd = Number(values["max-usd"])
    console.log(`llm: ${model} via ${baseUrl}; cap $${maxUsd}${values["max-evals"] !== "0" ? `, ${values["max-evals"]} evals` : ""}`)
    evaluation = { evaluate: makeRubricEvaluator(makeOpenAiCompatClient({ baseUrl, apiKey, model })), maxEvals: Number(values["max-evals"]) || undefined, maxUsd, costPerEvalUsd: Number(values["cost-per-eval"]) || undefined }
  }
  if (values.curate) {
    const curateMaxUsd = Number(values["curate-max-usd"])
    let ids: ReadonlySet<string> | undefined
    if (values["curate-ids"]) {
      ids = new Set(JSON.parse(readFileSync(values["curate-ids"], "utf8")) as string[])
    }
    console.log(`curate: ${model} via ${baseUrl}; cap $${curateMaxUsd}, max ${values["curate-max-items"]} items${ids ? `, ${ids.size} targeted ids` : ""}`)
    curation = {
      curate: makeCurator(makeOpenAiCompatClient({ baseUrl, apiKey, model })),
      maxItems: Number(values["curate-max-items"]) || undefined,
      maxUsd: curateMaxUsd,
      costPerItemUsd: Number(values["curate-cost-per-item"]) || undefined,
      ...(ids ? { ids } : {}),
    }
  }
}

const sources: SyncSource[] = []

if (values.fixtures) {
  const dir = values.fixtures
  sources.push({ name: `fixtures:${dir}`, load: async () => loadFixtureCandidates(dir) })
}

if (values.topics) {
  const token = process.env.GITHUB_TOKEN
  const pages = Math.max(1, Number(values.pages) || 1)
  const minStars = Math.max(0, Number(values["min-stars"]) || 0)
  for (const topic of values.topics.split(",").map((t) => t.trim()).filter(Boolean)) {
    const categoryHint = TOPIC_HINTS[topic]
    sources.push({
      name: `github:${topic}`,
      load: async () => {
        const hits = await searchReposByTopic({ topic, token, fetchImpl, limit: Number(values["max-repos"]), pages, minStars })
        const out: Candidate[] = []
        const warnings: string[] = []
        for (const hit of hits) {
          if (hit.archived) continue
          try {
            out.push(...(await fetchRepoSkills({ repo: hit.repo, ref: hit.defaultBranch, token, fetchImpl, license: hit.license, signals: hit.signals, maxSkills: Number(values["max-skills"]), categoryHint })))
          } catch (error) {
            if (error instanceof RateLimitError) throw error
            warnings.push(`repo ${hit.repo}: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        return warnings.length > 0 ? { candidates: out, warnings } : out
      },
    })
  }
}

if (values.seeds) {
  const seedPath = values.seeds
  if (!existsSync(seedPath)) {
    console.error(`--seeds file not found: ${seedPath}`)
    process.exit(2)
  }
  const allSeeds = JSON.parse(readFileSync(seedPath, "utf8")) as SeedRepo[]
  const seedLimit = Math.max(0, Number(values["seed-limit"]) || 0)
  const seeds = seedLimit > 0 ? allSeeds.slice(0, seedLimit) : allSeeds
  console.log(`seeds: ${seeds.length}${seedLimit > 0 ? ` of ${allSeeds.length}` : ""} from ${seedPath}`)
  sources.push({
    name: "seeds",
    load: async () => {
      const result = await fetchSeedRepos({ seeds, token: process.env.GITHUB_TOKEN, fetchImpl, maxSkills: Number(values["max-skills"]) })
      return result.warnings.length > 0 ? { candidates: result.candidates, warnings: result.warnings } : result.candidates
    },
  })
}

if (values.agentskills) {
  const baseUrl = values.agentskills
  sources.push({ name: "agentskills", load: async () => fetchAgentskills({ baseUrl, fetchImpl, limit: Number(values["agentskills-limit"]) }) })
}

const calibrationPath = join(values.out, "calibration.json")
const weights = existsSync(calibrationPath) ? readCalibration(calibrationPath) : undefined
console.log(`sync: ${sources.length} source(s) -> ${values.out} (state ${stateDir})${weights ? "; calibrated weights applied" : ""}`)

const result = await syncCatalog({ sources, outDir: values.out, stateDir, weights, evaluation, curation, vectors })
const summary = result.summary
console.log(`sync: ${summary.candidates} candidate(s) -> ${summary.published} published, ${summary.quarantined} quarantined, ${summary.rejected} rejected`)
const spread = Object.entries(result.index.counts.byCategory).sort((a, b) => b[1] - a[1])
console.log(`  categories: ${spread.map(([category, count]) => `${category}:${count}`).join(", ")}`)
if (summary.topRejections.length > 0) {
  console.log(`  rejected: ${summary.topRejections.map((entry) => `${entry.reason} x${entry.count}`).join(", ")}`)
}
const failedNote = summary.failed > 0 ? `, failed ${summary.failed}` : ""
console.log(`  evaluated ${summary.evaluated} (cached ${summary.cached}, budget-skipped ${summary.skippedBudget}${failedNote}, spend $${summary.spentUsd.toFixed(4)}), duplicates ${summary.duplicates}`)
console.log(`  added ${result.reconciliation.totals.added.length}, removed ${result.reconciliation.totals.removed.length}, changed ${result.reconciliation.totals.changed.length}`)
for (const gap of result.reconciliation.gaps) console.log(`  gap: ${gap}`)
if (result.vectors) {
  console.log(`vectors: embedded ${result.vectors.embedded}, reused ${result.vectors.reused}`)
  for (const warning of result.vectors.warnings) console.log(`  vector warning: ${warning}`)
}
if (result.curation) {
  console.log(`curate: ${result.curation.summary}`)
  for (const correction of result.curation.corrections) console.log(`  corrected ${correction.id}: ${correction.from} -> ${correction.to}`)
  for (const highlight of result.curation.highlights) console.log(`  flagged ${highlight.id}: ${highlight.flags.join(", ")}`)
}
