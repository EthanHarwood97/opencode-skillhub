# SkillHub Phase 2 Implementation Plan (Plugin + Router)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the opencode plugin layer from spec §12 Phase 2 — router search + load tools, config-hook tier management (managed dir + `/skills` command), update/promotion toasts, permission-gated loads — with the advertised-surface budget measured at ≤ ~1k tokens and mid-session discover→load reachable in ≤2 tool calls.

**Architecture:** one new workspace package `packages/plugin` (dev/npm name `opencode-skillhub`), loaded as a local opencode plugin (in-repo path during dev). It reuses catalog types via **`import type` only** (runtime imports of modules that touch `node:sqlite` are forbidden under Bun) and cli path/lockfile helpers (no SQLite). The router queries `search.db` through **`bun:sqlite`** (probe-verified available; `node:sqlite` is not). All logic is unit-tested in Node via dependency injection; thin Bun/runtime bindings are exercised by a sandboxed E2E under opencode 1.18.18.

**Tech Stack:** TypeScript on Node ≥ 22.23 for tests, opencode's Bun runtime for the plugin, `@opencode-ai/plugin@1.18.18` (`tool` helper), zod, gray-matter, `bun:sqlite` (runtime-only), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-05-skillhub-design.md` (§4, §5.3, §9, §10.3, §12 Phase 2, §13 SC2/SC3).
**Phase 0 probes:** `docs/superpowers/probes/2026-10-05-phase0-probes.md` (§7 containment).

## Verified platform facts (Phase 2 probes, 2026-10-05)

| Fact | Detail |
|------|--------|
| Custom tools | `tool({ description, args, execute })` from `@opencode-ai/plugin`; model called `skillhub_probe` → returned `probe-echo:hello`. `ToolContext` includes `ask({ permission, patterns, always, metadata })`. |
| Command injection | A plugin `config` hook can add `cfg.command.<name> = { description, template }`; `opencode run --command <name>` executed the injected command headlessly (`SKILLHUB_COMMAND_OK`). |
| Toast | `client.tui.showToast({ body: { message, variant: "info"|"success"|"warning"|"error" } })` (SDK, used by plugins). |
| Permission hook | `permission.ask(input: Permission, output: { status })` exists; per-tool ask also available via `ToolContext.ask`. |
| **SQLite runtime** | **`node:sqlite` is NOT available in opencode's Bun runtime; `bun:sqlite` is** (`Database` function). Plugin must use `bun:sqlite`; Node-only code paths must never be imported at runtime (use `import type`). |
| Plugin package | `@opencode-ai/plugin@1.18.18` exists on npm and installs cleanly; plugin file importing it resolves at runtime. |

## Global Constraints

Copied from the spec + probes; every task's requirements implicitly include these.

- **Runtime split:** plugin code runs under opencode's **Bun**; unit tests run under **Node 22**. Never runtime-import a module containing `node:sqlite` (notably `catalog/src/publish.ts`, `cli/src/search.ts`, `cli/src/installer.ts` → type-only where needed). `bun:sqlite` imports may only live in runtime-binding modules loaded lazily and must never be imported by tests directly.
- Node >= 22.23, `"type": "module"`, relative imports end `.ts`; zero native runtime deps; Windows-first.
- **No silent changes:** the plugin never installs or activates; it reads state and toasts. `activate`/`deactivate` stay CLI commands. Load gating uses `ToolContext.ask`.
- **Budget:** L0 (router tool description incl. capability map) ≤ ~250 est. tokens; L1 (managed dir advertised block) budgeted so L0+L1 ≤ ~1,000 est. tokens (chars/4); managed set floats ~8–10 skills (Phase 0 measurement).
- Sandbox rules (Phase 0 §7): every E2E pins `OPENCODE_TEST_HOME`/`HOME`/`XDG_*` to a temp home and git-inits the fixture root; never rely on `USERPROFILE`; `OPENCODE_DISABLE_EXTERNAL_SKILLS` only where negative isolation is the point.
- Unit tests never hit the network; LLM-involving E2E steps are gated behind `SKILLHUB_LIVE=1`.
- Determinism in readers/status output; sorted keys; no wall-clock in unit-tested output except injected `now`.

## File Structure

```
packages/plugin/
├─ package.json               # opencode-skillhub (dev); deps: @opencode-ai/plugin, zod, gray-matter
├─ src/plugin.ts              # plugin entry: wires hooks + tools (Bun runtime)
├─ src/root.ts                # SkillHub home discovery (SKILLHUB_HOME) + layout (reuses cli/paths)
├─ src/catalog-read.ts        # index.json reader (type-only CatalogIndex)
├─ src/lock-read.ts           # lockfile reader (reuses cli/lockfile)
├─ src/search-core.ts         # pure: FTS query build + hit formatting + capability map
├─ src/search-runtime.ts      # bun:sqlite binding (lazy; runtime only)
├─ src/tools.ts               # makeRouterTool(deps), makeLoadTool(deps)
├─ src/load-core.ts           # body resolution, size cap → temp file, risk summary
├─ src/config-hook.ts         # cfg.skills.paths injection + cfg.command.skills injection
├─ src/status-core.ts         # /skills status rendering (pure)
├─ src/events.ts              # startup toast (updates available; promotions) — once per process
├─ src/usage.ts               # per-project usage tracking (search/load counts)
├─ src/manage-core.ts         # budget enforcement (demote least-used) + promotion candidates
└─ test/*.test.ts             # Node unit tests + sandboxed E2E (LLM parts env-gated)
```

---

### Task 1: Plugin package scaffold + readers

**Files:**
- Create: `packages/plugin/package.json`, `packages/plugin/src/root.ts`, `packages/plugin/src/catalog-read.ts`, `packages/plugin/src/lock-read.ts`
- Test: `packages/plugin/test/readers.test.ts`

**Interfaces:**
- Consumes: `layout`, `resolveHome` from `packages/cli/src/paths.ts` (no SQLite); `type CatalogIndex` from `packages/catalog/src/publish.ts` (**`import type` only**); `type Lockfile/LockEntry` from `packages/cli/src/lockfile.ts`.
- Produces:
  - `readCatalogIndex(root: string): CatalogIndex | undefined` (undefined when no catalog yet)
  - `readLock(root: string): Lockfile` (defaults `{ version: 1, skills: {} }`)
  - `SkillHubPaths` = `StoreLayout` re-export for the plugin
  - `findRecord(index: CatalogIndex, id: string): SkillRecord | undefined`

- [ ] **Step 1: Write the failing tests**

`packages/plugin/test/readers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/plugin/test/readers.test.ts`
Expected: FAIL — cannot resolve `../src/catalog-read.ts`.

- [ ] **Step 3: Write package + readers**

`packages/plugin/package.json`:

```json
{
  "name": "opencode-skillhub",
  "private": true,
  "type": "module",
  "version": "0.0.1",
  "dependencies": {
    "@opencode-ai/plugin": "1.18.18",
    "gray-matter": "^4.0.3",
    "zod": "^3.25.0"
  }
}
```

Then run `npm install` from the repo root so the workspace links and root hoists the deps.

`packages/plugin/src/root.ts`:

```ts
import { layout, resolveHome, type StoreLayout } from "../../cli/src/paths.ts"

/** Resolve the SkillHub store root for the current environment. */
export function resolveRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.SKILLHUB_HOME ?? resolveHome(env)
}

/** Store layout (re-exported shape so the plugin has one import site). */
export function skillhubPaths(root: string): StoreLayout {
  return layout(root)
}
```

`packages/plugin/src/catalog-read.ts`:

```ts
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CatalogIndex } from "../../catalog/src/publish.ts"
import type { SkillRecord } from "../../catalog/src/types.ts"
import type { FileEntry } from "../../catalog/src/types.ts"
import type { Lockfile } from "../../cli/src/lockfile.ts"

export function readCatalogIndex(root: string): CatalogIndex | undefined {
  const path = join(root, "catalog", "index.json")
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, "utf8")) as CatalogIndex
}

export function readLock(root: string): Lockfile {
  const path = join(root, "lockfile.json")
  if (!existsSync(path)) return { version: 1, skills: {} }
  return JSON.parse(readFileSync(path, "utf8")) as Lockfile
}

export function findRecord(index: CatalogIndex, id: string): SkillRecord | undefined {
  return index.skills.find((s) => s.id === id)
}

export type { FileEntry }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/plugin/test/readers.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin package-lock.json package.json
git commit -m "feat(plugin): scaffold opencode-skillhub package with catalog/lock readers"
```

---

### Task 2: Search core (pure) — query building, hit formatting, capability map

**Files:**
- Create: `packages/plugin/src/search-core.ts`
- Test: `packages/plugin/test/search-core.test.ts`

**Interfaces:**
- Produces:
  - `type SearchRow = { id: string; name: string; description: string; category: string; total: number; risk: string; provenance: string; status: string }`
  - `buildFtsQuery(input: string): string`
  - `formatHits(rows: SearchRow[], limit?: number): string`
  - `CAPABILITY_MAP: string[]` (~15 lines) and `ROUTER_DESCRIPTION: string` (map + "search before non-trivial tasks" phrasing)
  - `estimateTokens(text: string): number` (`Math.ceil(text.length / 4)`)

- [ ] **Step 1: Write the failing tests**

`packages/plugin/test/search-core.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { buildFtsQuery, CAPABILITY_MAP, estimateTokens, formatHits, ROUTER_DESCRIPTION } from "../src/search-core.ts"

describe("buildFtsQuery", () => {
  it("quotes tokens and strips quotes", () => {
    expect(buildFtsQuery('make "pdf" text')).toBe('"make" "pdf" "text"')
  })
  it("drops empty tokens", () => {
    expect(buildFtsQuery("  a   b ")).toBe('"a" "b"')
  })
})

describe("formatHits", () => {
  const rows = [
    { id: "a/one", name: "one", description: "does one", category: "writing", total: 91, risk: "low", provenance: "sha-pinned", status: "candidate" },
    { id: "a/two", name: "two", description: "does two", category: "data", total: 42, risk: "medium", provenance: "content-hash-pinned", status: "candidate" },
  ]
  it("renders one line per hit with score, category, risk", () => {
    const text = formatHits(rows)
    expect(text).toContain("a/one")
    expect(text).toContain("[91]")
    expect(text).toContain("risk=low")
    expect(text.split("\n")).toHaveLength(2)
  })
  it("caps at the limit and handles empties", () => {
    expect(formatHits(rows, 1).split("\n")).toHaveLength(1)
    expect(formatHits([])).toBe("No matching skills.")
  })
})

describe("budget", () => {
  it("keeps the router description within ~250 est. tokens", () => {
    expect(CAPABILITY_MAP.length).toBeGreaterThanOrEqual(12)
    expect(estimateTokens(ROUTER_DESCRIPTION)).toBeLessThanOrEqual(250)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/plugin/test/search-core.test.ts`
Expected: FAIL — cannot resolve `../src/search-core.ts`.

- [ ] **Step 3: Write search-core**

`packages/plugin/src/search-core.ts`:

```ts
export type SearchRow = {
  id: string
  name: string
  description: string
  category: string
  total: number
  risk: string
  provenance: string
  status: string
}

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

export function buildFtsQuery(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, "")}"`)
    .join(" ")
}

export function formatHits(rows: SearchRow[], limit = 5): string {
  if (rows.length === 0) return "No matching skills."
  return rows
    .slice(0, limit)
    .map((r) => `${r.id} [${r.total}] ${r.category} risk=${r.risk} ${r.provenance} — ${r.description.slice(0, 120)}`)
    .join("\n")
}

export const CAPABILITY_MAP: string[] = [
  "PDF/document manipulation",
  "spreadsheets & data cleaning",
  "word docs & reports",
  "web design & frontend engineering",
  "SEO, keywords & content strategy",
  "marketing, ads & growth",
  "business, finance & legal ops",
  "research & evidence gathering",
  "testing & QA",
  "security & supply chain",
  "infrastructure & DevOps",
  "Cloudflare/Workers",
  "database & Postgres",
  "writing, editing & copy",
  "agent/skill authoring",
]

export const ROUTER_DESCRIPTION = [
  "Search the SkillHub library (tens of thousands of agent skills) for the best skill for the current task.",
  "Call this BEFORE non-trivial tasks to check whether a specialized skill exists; then call skillhub_load with the chosen id.",
  "Library covers: " + CAPABILITY_MAP.join("; ") + ".",
  "Returns top-5 matches with score, category, risk, and provenance; bodies are never returned here.",
].join("\n")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/plugin/test/search-core.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin/src/search-core.ts packages/plugin/test/search-core.test.ts
git commit -m "feat(plugin): pure search core with capability map and token budget"
```

---

### Task 3: Router tool + Bun runtime binding

**Files:**
- Create: `packages/plugin/src/search-runtime.ts`, `packages/plugin/src/tools.ts`
- Modify: `packages/plugin/src/plugin.ts` (create if absent — minimal wiring)
- Test: `packages/plugin/test/tools.test.ts`

**Interfaces:**
- Consumes: `SearchRow`, `buildFtsQuery`, `formatHits`, `ROUTER_DESCRIPTION` (Task 2); `resolveRoot`, `skillhubPaths` (Task 1); `tool` from `@opencode-ai/plugin`.
- Produces:
  - `type RouterDeps = { search: (query: string, limit?: number) => Promise<SearchRow[]> }`
  - `makeRouterTool(deps: RouterDeps): ToolDefinition` (name `skillhub_search`)
  - `searchRuntime(root: string, query: string, limit?: number): Promise<SearchRow[]>` in `search-runtime.ts` — lazy `await import("bun:sqlite")`, throws `SkillHubRuntimeError` with a clear message if unavailable.
  - `plugin.ts` registers `skillhub_search` wired to `searchRuntime(resolveRoot(), ...)`.

- [ ] **Step 1: Write the failing tests**

`packages/plugin/test/tools.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { makeRouterTool } from "../src/tools.ts"
import type { SearchRow } from "../src/search-core.ts"

const row: SearchRow = {
  id: "a/one", name: "one", description: "does one", category: "writing",
  total: 91, risk: "low", provenance: "sha-pinned", status: "candidate",
}

describe("makeRouterTool", () => {
  it("exposes the router description and returns formatted hits", async () => {
    const t = makeRouterTool({ search: async () => [row] })
    expect(t.description).toContain("SkillHub library")
    const out = await t.execute({ query: "one" }, {} as any)
    expect(typeof out === "string" ? out : out.output).toContain("a/one")
  })

  it("returns a no-match message without throwing", async () => {
    const t = makeRouterTool({ search: async () => [] })
    const out = await t.execute({ query: "zzz" }, {} as any)
    expect(typeof out === "string" ? out : out.output).toContain("No matching skills")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/plugin/test/tools.test.ts`
Expected: FAIL — cannot resolve `../src/tools.ts`.

- [ ] **Step 3: Write runtime + tools + entry**

`packages/plugin/src/search-runtime.ts`:

```ts
import { join } from "node:path"
import type { SearchRow } from "./search-core.ts"
import { buildFtsQuery } from "./search-core.ts"

export class SkillHubRuntimeError extends Error {}

/** Runtime-only: queries search.db through bun:sqlite (opencode's Bun runtime). */
export async function searchRuntime(root: string, query: string, limit = 5): Promise<SearchRow[]> {
  let Database: any
  try {
    const bunSqlite: any = await import("bun:sqlite")
    Database = bunSqlite.Database
  } catch {
    throw new SkillHubRuntimeError("bun:sqlite is unavailable in this runtime")
  }
  const db = new Database(join(root, "catalog", "search.db"), { readonly: true })
  try {
    const rows = db
      .prepare(
        `SELECT s.id, s.name, s.description, s.category, s.total, s.risk, s.provenance, s.status
         FROM skills_fts f JOIN skills s ON s.id = f.id
         WHERE skills_fts MATCH ? ORDER BY bm25(skills_fts), s.total DESC LIMIT ?`,
      )
      .all(buildFtsQuery(query), limit)
    return rows as SearchRow[]
  } finally {
    db.close()
  }
}
```

`packages/plugin/src/tools.ts`:

```ts
import { tool } from "@opencode-ai/plugin"
import type { SearchRow } from "./search-core.ts"
import { formatHits, ROUTER_DESCRIPTION } from "./search-core.ts"

export type RouterDeps = { search: (query: string, limit?: number) => Promise<SearchRow[]> }

export function makeRouterTool(deps: RouterDeps) {
  return tool({
    description: ROUTER_DESCRIPTION,
    args: { query: tool.schema.string() },
    async execute(args: { query: string }) {
      const rows = await deps.search(args.query, 5)
      return formatHits(rows)
    },
  })
}
```

`packages/plugin/src/plugin.ts`:

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { resolveRoot } from "./root.ts"
import { searchRuntime } from "./search-runtime.ts"
import { makeRouterTool } from "./tools.ts"

export const SkillHubPlugin: Plugin = async () => {
  const root = resolveRoot()
  return {
    tool: {
      skillhub_search: makeRouterTool({ search: (q, limit) => searchRuntime(root, q, limit) }),
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/plugin/test/tools.test.ts`
Expected: 2 passed. (The `bun:sqlite` runtime path is covered by the E2E in Task 8; unit tests inject a fake search.)

- [ ] **Step 5: Commit**

```bash
git add packages/plugin/src
git commit -m "feat(plugin): skillhub_search router tool with bun:sqlite runtime binding"
```

### Task 4: Load tool — body resolution, size cap, permission ask

**Files:**
- Create: `packages/plugin/src/load-core.ts`
- Modify: `packages/plugin/src/tools.ts`
- Test: `packages/plugin/test/load-tool.test.ts`

**Interfaces:**
- Consumes: `tool` helper, `SearchRow` not needed here; `SkillRecord` type-only if used.
- Produces:
  - `renderLoadResult(input: { id: string; body: string; riskLevel?: string; maxBytes?: number; spill?: (content: string) => Promise<string> }): Promise<string>` — body ≤ cap returned verbatim (prefixed with one risk/summary line when `riskLevel` given); oversized bodies are written via `spill` and replaced by a path hint.
  - `readSkillBodyFromDisk(root: string, id: string): string | undefined` — `managed/<id>/SKILL.md` first, then `store/<id>/SKILL.md`.
  - `makeLoadTool(deps: { read: (id: string) => Promise<string | undefined>; spill?: (content: string) => Promise<string> })` — tool name `skillhub_load`, calls `context.ask({ permission: "skillhub_load", patterns: [id], always: [], metadata: { id } })` before reading.

- [ ] **Step 1: Write the failing tests**

`packages/plugin/test/load-tool.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { makeLoadTool, renderLoadResult } from "../src/load-core.ts"

describe("renderLoadResult", () => {
  it("returns the body with a risk line when small", async () => {
    const out = await renderLoadResult({ id: "a/x", body: "# X\n", riskLevel: "low" })
    expect(out).toContain("risk=low")
    expect(out).toContain("# X")
  })
  it("spills oversized bodies to a path hint", async () => {
    const big = "x".repeat(60_000)
    const out = await renderLoadResult({ id: "a/x", body: big, spill: async () => "C:/tmp/skill.md" })
    expect(out).toContain("C:/tmp/skill.md")
    expect(out).not.toContain(big)
  })
})

describe("makeLoadTool", () => {
  it("asks permission then returns the body", async () => {
    const ask = vi.fn(async () => {})
    const t = makeLoadTool({ read: async () => "# Body\n" })
    const out = await t.execute({ id: "a/x" }, { ask } as any)
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ permission: "skillhub_load", patterns: ["a/x"] }))
    expect(typeof out === "string" ? out : out.output).toContain("# Body")
  })
  it("explains a missing skill instead of throwing", async () => {
    const t = makeLoadTool({ read: async () => undefined })
    const out = await t.execute({ id: "a/nope" }, { ask: async () => {} } as any)
    expect(typeof out === "string" ? out : out.output).toMatch(/not installed|not found/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/plugin/test/load-tool.test.ts`
Expected: FAIL — cannot resolve `../src/load-core.ts`.

- [ ] **Step 3: Write load-core + extend tools**

`packages/plugin/src/load-core.ts`:

```ts
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tool } from "@opencode-ai/plugin"

const DEFAULT_MAX_BYTES = 50 * 1024

export function readSkillBodyFromDisk(root: string, id: string): string | undefined {
  for (const base of ["managed", "store"]) {
    const p = join(root, base, id, "SKILL.md")
    if (existsSync(p)) return readFileSync(p, "utf8")
  }
  return undefined
}

export async function renderLoadResult(input: {
  id: string
  body: string
  riskLevel?: string
  maxBytes?: number
  spill?: (content: string) => Promise<string>
}): Promise<string> {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES
  const header = `SkillHub load: ${input.id}${input.riskLevel ? ` risk=${input.riskLevel}` : ""}`
  const bytes = Buffer.byteLength(input.body)
  if (bytes <= maxBytes) return `${header}\n\n${input.body}`
  if (!input.spill) return `${header}\n\n(omitted: ${bytes} bytes exceeds ${maxBytes} and no spill target available)`
  const path = await input.spill(input.body)
  return `${header}\n\n(full body ${bytes} bytes written to ${path})`
}

export function makeLoadTool(deps: {
  read: (id: string) => Promise<string | undefined>
  riskFor?: (id: string) => Promise<string | undefined>
  spill?: (content: string) => Promise<string>
}) {
  return tool({
    description: "Load the full SKILL.md body for a SkillHub id returned by skillhub_search. Requires permission.",
    args: { id: tool.schema.string() },
    async execute(args: { id: string }, context) {
      await context.ask({ permission: "skillhub_load", patterns: [args.id], always: [], metadata: { id: args.id } })
      const body = await deps.read(args.id)
      if (body === undefined) return `SkillHub: "${args.id}" is not installed or not found. Run skillhub install ${args.id} first.`
      return renderLoadResult({ id: args.id, body, riskLevel: await deps.riskFor?.(args.id), spill: deps.spill })
    },
  })
}
```

Extend `packages/plugin/src/tools.ts` with `export { makeLoadTool } from "./load-core.ts"` (re-export so the plugin wiring has one tools import).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/plugin/test/load-tool.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin/src packages/plugin/test
git commit -m "feat(plugin): skillhub_load tool with permission ask and 50KiB spill"
```

---

### Task 5: Config hook + status core + startup notifier

**Files:**
- Create: `packages/plugin/src/config-hook.ts`, `packages/plugin/src/status-core.ts`, `packages/plugin/src/events.ts`
- Test: `packages/plugin/test/status.test.ts`

**Interfaces:**
- Consumes: `resolveRoot`/`skillhubPaths` (Task 1), `readCatalogIndex`/`readLock` (Task 1).
- Produces:
  - `applyConfigToSkillHub(cfg: { skills?: any; command?: any }, opts: { root: string }): { addedSkillPath: boolean; addedCommand: boolean }` — dedupes the managed dir into `cfg.skills.paths`, adds `cfg.command.skills` only when absent.
  - `type StatusInput = { active: string[]; installed: number; updates: number; proposals: { id: string; uses: number }[]; l1Tokens: number; l0Tokens: number }`
  - `renderStatus(input: StatusInput): string`
  - `makeStartupNotifier(deps: { toast: (message: string, variant?: string) => Promise<void>; compute: () => StatusInput })` → `{ notifyOnce(): Promise<void>; fired: boolean }`

- [ ] **Step 1: Write the failing tests**

`packages/plugin/test/status.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { applyConfigToSkillHub } from "../src/config-hook.ts"
import { makeStartupNotifier, renderStatus } from "../src/status-core.ts"

describe("applyConfigToSkillHub", () => {
  it("adds the managed dir once and preserves existing paths", () => {
    const cfg: any = { skills: { paths: ["C:/other"] } }
    applyConfigToSkillHub(cfg, { root: "C:/root" })
    const again = applyConfigToSkillHub(cfg, { root: "C:/root" })
    expect(cfg.skills.paths).toContain("C:/other")
    expect(cfg.skills.paths.filter((p: string) => p.includes("managed"))).toHaveLength(1)
    expect(again.addedSkillPath).toBe(false)
  })
  it("adds the /skills command but never overwrites an existing one", () => {
    const cfg: any = {}
    applyConfigToSkillHub(cfg, { root: "C:/root" })
    expect(cfg.command.skills.template).toBeTruthy()
    cfg.command.skills = { description: "custom", template: "custom" }
    applyConfigToSkillHub(cfg, { root: "C:/root" })
    expect(cfg.command.skills.template).toBe("custom")
  })
})

describe("renderStatus", () => {
  it("shows active, updates, proposals and the budget", () => {
    const text = renderStatus({ active: ["a/one"], installed: 3, updates: 1, proposals: [{ id: "a/two", uses: 4 }], l1Tokens: 420, l0Tokens: 180 })
    expect(text).toContain("active 1")
    expect(text).toContain("a/one")
    expect(text).toContain("updates available: 1")
    expect(text).toContain("a/two")
    expect(text).toContain("600/1000")
  })
})

describe("makeStartupNotifier", () => {
  it("toasts once for updates and once for proposals", async () => {
    const toasts: string[] = []
    const n = makeStartupNotifier({ toast: async (m) => void toasts.push(m), compute: () => ({ active: [], installed: 0, updates: 2, proposals: [], l1Tokens: 0, l0Tokens: 0 }) })
    await n.notifyOnce()
    await n.notifyOnce()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toContain("2 updates")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/plugin/test/status.test.ts`
Expected: FAIL — cannot resolve `../src/config-hook.ts`.

- [ ] **Step 3: Write the three modules**

`packages/plugin/src/config-hook.ts`:

```ts
import { join } from "node:path"

export function applyConfigToSkillHub(
  cfg: { skills?: any; command?: any },
  opts: { root: string },
): { addedSkillPath: boolean; addedCommand: boolean } {
  const managed = join(opts.root, "managed")
  cfg.skills = { ...(cfg.skills ?? {}) }
  const paths: string[] = Array.isArray(cfg.skills.paths) ? [...cfg.skills.paths] : []
  const addedSkillPath = !paths.includes(managed)
  if (addedSkillPath) paths.push(managed)
  cfg.skills.paths = paths

  cfg.command = { ...(cfg.command ?? {}) }
  const addedCommand = cfg.command.skills === undefined
  if (addedCommand) {
    cfg.command.skills = { description: "Show SkillHub status (active, updates, promotions, budget)", template: "SkillHub status request." }
  }
  return { addedSkillPath, addedCommand }
}
```

`packages/plugin/src/status-core.ts`:

```ts
export type StatusInput = {
  active: string[]
  installed: number
  updates: number
  proposals: { id: string; uses: number }[]
  l1Tokens: number
  l0Tokens: number
}

export function renderStatus(input: StatusInput): string {
  const lines = [
    `SkillHub — active ${input.active.length}/${input.installed} installed`,
    input.active.length ? `  active: ${input.active.join(", ")}` : "  active: (none)",
    `  updates available: ${input.updates}`,
    input.proposals.length ? `  promotion proposals: ${input.proposals.map((p) => `${p.id} (${p.uses} uses)`).join(", ")}` : "  promotion proposals: none",
    `  context budget: ${input.l0Tokens + input.l1Tokens}/1000 est. tokens (L0 ${input.l0Tokens} + L1 ${input.l1Tokens})`,
  ]
  return lines.join("\n")
}

export function makeStartupNotifier(deps: {
  toast: (message: string, variant?: string) => Promise<void>
  compute: () => StatusInput
}) {
  let fired = false
  return {
    get fired() {
      return fired
    },
    async notifyOnce(): Promise<void> {
      if (fired) return
      fired = true
      const status = deps.compute()
      if (status.updates > 0) await deps.toast(`SkillHub: ${status.updates} skill update(s) available — run \`skillhub review\``, "warning")
      if (status.proposals.length > 0)
        await deps.toast(`SkillHub: ${status.proposals.length} skill(s) ready to promote — run /skills`, "info")
    },
  }
}
```

`packages/plugin/src/events.ts`:

```ts
export type EventLike = { type: string }

/** True for the first session boundary of a process; used to fire the startup toast. */
export function isSessionBoundary(event: EventLike): boolean {
  return event.type === "session.created" || event.type === "server.connected"
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/plugin/test/status.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin/src packages/plugin/test
git commit -m "feat(plugin): config-hook tier injection, /skills command seed, status + startup notifier"
```

---

### Task 6: Usage tracking + budget enforcement + promotion candidates

**Files:**
- Create: `packages/plugin/src/usage.ts`, `packages/plugin/src/manage-core.ts`
- Test: `packages/plugin/test/manage.test.ts`

**Interfaces:**
- Consumes: `Lockfile` types, `estimateTokens` (Task 2).
- Produces:
  - `usageFileFor(root: string, projectDir: string): string` (sha256-based, first 8 hex)
  - `type Usage = { version: 1; loads: Record<string, { count: number; lastAt: string }>; searches: number }`
  - `readUsage(file: string): Usage`, `recordLoad(file: string, id: string, now: Date): Usage`, `recordSearch(file: string, now: Date): Usage`
  - `type ActiveAdvert = { id: string; name: string; description: string }`
  - `estimateAdvertisedTokens(adverts: ActiveAdvert[]): number`
  - `enforceBudget(input: { adverts: ActiveAdvert[]; uses: Record<string, number>; cap: number }): { keep: string[]; demote: string[] }`
  - `promotionCandidates(input: { lock: Lockfile; usage: Usage; threshold?: number }): { id: string; uses: number }[]`

- [ ] **Step 1: Write the failing tests**

`packages/plugin/test/manage.test.ts`:

```ts
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { enforceBudget, estimateAdvertisedTokens, promotionCandidates, readUsage, recordLoad, recordSearch, usageFileFor } from "../src/manage-core.ts"

const advert = (id: string, description = "d".repeat(100)) => ({ id, name: id.split("/").at(-1)!, description })

describe("usage", () => {
  it("writes per-project usage with counts", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-usage-"))
    const file = usageFileFor(root, "C:/projects/alpha")
    expect(file.startsWith(root)).toBe(true)
    const u1 = recordLoad(recordSearch(file, new Date("2026-10-05T00:00:00Z")), "a/one", new Date("2026-10-05T00:00:01Z"))
    expect(u1.searches).toBe(1)
    const u2 = readUsage(file)
    expect(u2.loads["a/one"]?.count).toBe(1)
  })
})

describe("budget", () => {
  it("estimates tokens from names + descriptions", () => {
    expect(estimateAdvertisedTokens([advert("a/one")])).toBeGreaterThan(25)
  })
  it("demotes least-used skills beyond the cap, keeping highest-use first", () => {
    const adverts = [advert("a/hot"), advert("a/cold"), advert("a/mid")]
    const r = enforceBudget({ adverts, uses: { "a/hot": 9, "a/mid": 3, "a/cold": 0 }, cap: estimateAdvertisedTokens([adverts[0]!, adverts[2]!]) })
    expect(r.keep).toEqual(["a/hot", "a/mid"])
    expect(r.demote).toEqual(["a/cold"])
  })
})

describe("promotionCandidates", () => {
  it("lists installed-inactive skills used at or above threshold", () => {
    const lock = { version: 1 as const, skills: { "a/one": { active: false }, "a/two": { active: true }, "a/three": { active: false } } as any }
    const usage = { version: 1 as const, searches: 0, loads: { "a/one": { count: 3, lastAt: "" }, "a/three": { count: 1, lastAt: "" } } }
    expect(promotionCandidates({ lock, usage }).map((c) => c.id)).toEqual(["a/one"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/plugin/test/manage.test.ts`
Expected: FAIL — cannot resolve `../src/manage-core.ts`.

- [ ] **Step 3: Write usage + manage-core**

`packages/plugin/src/usage.ts`:

```ts
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type Usage = { version: 1; loads: Record<string, { count: number; lastAt: string }>; searches: number }

export function usageFileFor(root: string, projectDir: string): string {
  const hash = createHash("sha256").update(projectDir).digest("hex").slice(0, 8)
  return join(root, "projects", hash, "usage.json")
}

export function readUsage(file: string): Usage {
  if (!existsSync(file)) return { version: 1, loads: {}, searches: 0 }
  return JSON.parse(readFileSync(file, "utf8")) as Usage
}

const write = (file: string, usage: Usage): Usage => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(usage, null, 2) + "\n")
  return usage
}

export function recordLoad(file: string, id: string, now: Date): Usage {
  const usage = readUsage(file)
  const prev = usage.loads[id] ?? { count: 0, lastAt: "" }
  usage.loads[id] = { count: prev.count + 1, lastAt: now.toISOString() }
  return write(file, usage)
}

export function recordSearch(file: string, now: Date): Usage {
  const usage = readUsage(file)
  usage.searches += 1
  return write(file, usage)
}
```

`packages/plugin/src/manage-core.ts`:

```ts
export { usageFileFor, readUsage, recordLoad, recordSearch, type Usage } from "./usage.ts"

export type ActiveAdvert = { id: string; name: string; description: string }

export function estimateAdvertisedTokens(adverts: ActiveAdvert[]): number {
  const chars = adverts.reduce((n, a) => n + a.name.length + a.description.length + 24, 0)
  return Math.ceil(chars / 4)
}

export function enforceBudget(input: {
  adverts: ActiveAdvert[]
  uses: Record<string, number>
  cap: number
}): { keep: string[]; demote: string[] } {
  const ranked = [...input.adverts].sort(
    (a, b) => (input.uses[b.id] ?? 0) - (input.uses[a.id] ?? 0) || a.id.localeCompare(b.id),
  )
  const keep: string[] = []
  const demote: string[] = []
  let used = 0
  for (const advert of ranked) {
    const cost = estimateAdvertisedTokens([advert])
    if (used + cost <= input.cap) {
      keep.push(advert.id)
      used += cost
    } else {
      demote.push(advert.id)
    }
  }
  return { keep, demote }
}

export function promotionCandidates(input: {
  lock: { skills: Record<string, { active: boolean }> }
  usage: { loads: Record<string, { count: number }> }
  threshold?: number
}): { id: string; uses: number }[] {
  const threshold = input.threshold ?? 3
  return Object.entries(input.lock.skills)
    .filter(([id, entry]) => !entry.active && (input.usage.loads[id]?.count ?? 0) >= threshold)
    .map(([id]) => ({ id, uses: input.usage.loads[id]!.count }))
    .sort((a, b) => b.uses - a.uses || a.id.localeCompare(b.id))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/plugin/test/manage.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin/src packages/plugin/test
git commit -m "feat(plugin): usage tracking, budget enforcement, promotion candidates"
```

---

### Task 7: Full plugin wiring + runtime glue + captures

**Files:**
- Modify: `packages/plugin/src/plugin.ts` (full wiring)
- Create: `packages/plugin/src/wiring.ts` (testable assembly helpers)
- Test: `packages/plugin/test/wiring.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `collectStatus(root: string, projectDir: string, now: Date): StatusInput` — reads lock/catalog/index, managed adverts (frontmatter name/description via `matter`), usage; computes updates (lock contentHash vs catalog record), proposals, budget.
  - `listManagedAdverts(root: string): ActiveAdvert[]` — reads `managed/*/*/SKILL.md` frontmatter safely.
  - `makeCapture(dir: string | undefined)` — `{ system?: (system: string[]) => void; toolCall?: (tool: string) => void }` writing `system.json` / `tool-calls.jsonl` when a dir is set (`SKILLHUB_CAPTURE_DIR`).
  - `plugin.ts` exports `SkillHubPlugin: Plugin` wiring: `config`, `tool` (search + load), `event` (startup toast once + usage search? no — search usage recorded inside router dep), `command.execute.before` (append status text part for `skills`), `tool.execute.before` (capture tool names), `experimental.chat.system.transform` (capture system).

- [ ] **Step 1: Write the failing wiring tests**

`packages/plugin/test/wiring.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { collectStatus, listManagedAdverts } from "../src/wiring.ts"

describe("listManagedAdverts", () => {
  it("reads managed skill frontmatter", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    const dir = join(root, "managed", "a", "one")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), "---\nname: one\ndescription: does one thing\n---\n\n# One\n")
    const adverts = listManagedAdverts(root)
    expect(adverts).toEqual([{ id: "a/one", name: "one", description: "does one thing" }])
  })
})

describe("collectStatus", () => {
  it("counts updates from hash drift and composes the budget", () => {
    const root = mkdtempSync(join(tmpdir(), "skillhub-wire-"))
    mkdirSync(join(root, "catalog"), { recursive: true })
    const dir = join(root, "managed", "a", "one")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), "---\nname: one\ndescription: does one thing\n---\n")
    writeFileSync(
      join(root, "lockfile.json"),
      JSON.stringify({ version: 1, skills: { "a/one": { id: "a/one", contentHash: "old", active: true, files: [], provenanceTier: "sha-pinned", installedAt: "", riskLevel: "low", total: 1 } } }),
    )
    writeFileSync(
      join(root, "catalog", "index.json"),
      JSON.stringify({ version: 1, generatedAt: "", counts: { total: 1, byStatus: {}, byCategory: {} }, skills: [{ id: "a/one", name: "one", description: "d", category: "c", tags: [], clusterId: "c/x", clusterLabel: "X", source: { kind: "local", path: "p", licenseFlags: [] }, files: [], contentHash: "new", requires: { runtime: [], scripts: [], mcp: [], env: [], services: [] }, risk: { level: "low", findings: [] }, signals: {}, scores: { total: 1, quality: 1, trust: 1, freshness: 1, compatibility: 1, adoption: 1, reasons: [], rubricVersion: "heuristic-v0", evaluatedAt: "" }, provenanceTier: "local", status: "candidate", relations: { supersedes: [], duplicates: [], alternatives: [] } }] }),
    )
    const status = collectStatus(root, "C:/proj", new Date("2026-10-05T00:00:00Z"))
    expect(status.updates).toBe(1)
    expect(status.active).toEqual(["a/one"])
    expect(status.l1Tokens).toBeGreaterThan(0)
    expect(status.l0Tokens).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/plugin/test/wiring.test.ts`
Expected: FAIL — cannot resolve `../src/wiring.ts`.

- [ ] **Step 3: Write wiring + full entry**

`packages/plugin/src/wiring.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { readCatalogIndex, readLock } from "./catalog-read.ts"
import { estimateAdvertisedTokens, promotionCandidates, readUsage, usageFileFor, type ActiveAdvert } from "./manage-core.ts"
import { estimateTokens, ROUTER_DESCRIPTION } from "./search-core.ts"
import type { StatusInput } from "./status-core.ts"

export function listManagedAdverts(root: string): ActiveAdvert[] {
  const base = join(root, "managed")
  const out: ActiveAdvert[] = []
  if (!existsSync(base)) return out
  for (const org of readdirSync(base)) {
    const orgDir = join(base, org)
    for (const name of readdirSync(orgDir)) {
      const file = join(orgDir, name, "SKILL.md")
      if (!existsSync(file)) continue
      try {
        const parsed = matter(readFileSync(file, "utf8"))
        const fmName = typeof parsed.data.name === "string" ? parsed.data.name : name
        const description = typeof parsed.data.description === "string" ? parsed.data.description : ""
        out.push({ id: `${org}/${name}`, name: fmName, description })
      } catch {
        out.push({ id: `${org}/${name}`, name, description: "" })
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export function collectStatus(root: string, projectDir: string, _now?: Date): StatusInput {
  const lock = readLock(root)
  const index = readCatalogIndex(root)
  const usage = readUsage(usageFileFor(root, projectDir))
  const active = Object.entries(lock.skills).filter(([, e]) => e.active).map(([id]) => id).sort()
  const updates = index
    ? Object.entries(lock.skills).filter(([id, e]) => {
        const record = index.skills.find((s) => s.id === id)
        return record !== undefined && record.contentHash !== e.contentHash
      }).length
    : 0
  const adverts = listManagedAdverts(root)
  return {
    active,
    installed: Object.keys(lock.skills).length,
    updates,
    proposals: promotionCandidates({ lock, usage }),
    l1Tokens: estimateAdvertisedTokens(adverts),
    l0Tokens: estimateTokens(ROUTER_DESCRIPTION),
  }
}

export function makeCapture(dir: string | undefined) {
  if (!dir) return { system: undefined, toolCall: undefined } as const
  mkdirSync(dir, { recursive: true })
  return {
    system: (system: string[]) => writeFileSync(join(dir, "system.json"), JSON.stringify(system, null, 2)),
    toolCall: (tool: string) => writeFileSync(join(dir, "tool-calls.jsonl"), `${JSON.stringify({ tool, at: Date.now() })}\n`, { flag: "a" }),
  }
}
```

(Remove the odd `now` comment block in implementation if the parameter stays unused — keep the parameter and prefix it as `_now` when unused, per lint-free simplicity. Implementer note: if unused, rename to `_now` but keep the positional signature for E2E reuse.)

`packages/plugin/src/plugin.ts`:

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { applyConfigToSkillHub } from "./config-hook.ts"
import { isSessionBoundary } from "./events.ts"
import { readCatalogIndex } from "./catalog-read.ts"
import { makeLoadTool, readSkillBodyFromDisk } from "./load-core.ts"
import { recordSearch, usageFileFor, readUsage } from "./manage-core.ts"
import { resolveRoot } from "./root.ts"
import { searchRuntime } from "./search-runtime.ts"
import { makeStartupNotifier, renderStatus } from "./status-core.ts"
import { makeRouterTool } from "./tools.ts"
import { collectStatus, makeCapture } from "./wiring.ts"

export const SkillHubPlugin: Plugin = async ({ client, directory }) => {
  const root = resolveRoot()
  const capture = makeCapture(process.env.SKILLHUB_CAPTURE_DIR)
  const notifier = makeStartupNotifier({
    toast: async (message, variant) => {
      await client.tui.showToast({ body: { message, variant: (variant as any) ?? "info" } }).catch(() => {})
    },
    compute: () => collectStatus(root, directory, new Date()),
  })

  return {
    config: async (cfg) => {
      applyConfigToSkillHub(cfg as any, { root })
    },
    tool: {
      skillhub_search: makeRouterTool({
        search: async (q, limit) => {
          const usageFile = usageFileFor(root, directory)
          recordSearch(usageFile, new Date())
          return searchRuntime(root, q, limit)
        },
      }),
      skillhub_load: makeLoadTool({
        read: async (id) => readSkillBodyFromDisk(root, id),
        riskFor: async (id) => readCatalogIndex(root)?.skills.find((s) => s.id === id)?.risk.level,
      }),
    },
    event: async ({ event }) => {
      if (isSessionBoundary(event as any)) await notifier.notifyOnce()
    },
    "command.execute.before": async (input, output) => {
      if (input.command === "skills") {
        output.parts.push({ type: "text", text: renderStatus(collectStatus(root, directory, new Date())) } as any)
      }
    },
    "tool.execute.before": async (input) => {
      capture.toolCall?.(input.tool)
    },
    "experimental.chat.system.transform": async (_input, output) => {
      capture.system?.(output.system)
    },
  }
}
```

- [ ] **Step 4: Run tests + a real sandbox wiring smoke**

Run: `npx vitest run packages/plugin/test/wiring.test.ts`
Expected: 2 passed.

Sandbox smoke (reuse `$sb` home, a fresh project `proj8` with `opencode.json` `plugin: ["<abs path to repo>/packages/plugin/src/plugin.ts"]`, and a prepared store/root under the sandbox home via `SKILLHUB_HOME`):

```powershell
# from the worktree, build+import a catalog and install/activate good-skill into a sandbox root (Node CLI), then:
opencode run --command skills -m deepseek/deepseek-flash
# Expected: output contains "SkillHub — active 1/1 installed"
```

If the injected text Part fails to materialize in output (shape error in Bun), iterate on the Part shape until the command output carries the status text — this is the one runtime shape the probes could not pre-verify. Record the final shape in the report.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin/src packages/plugin/test
git commit -m "feat(plugin): full hook wiring — config, tools, toasts, /skills, captures"
```

---

### Task 8: E2E under opencode (containment, budget, discover→load) + CI/acceptance

**Files:**
- Create: `packages/plugin/test/e2e-plugin.test.ts`
- Test: same

**Interfaces:**
- Consumes: cli build/install/activate helpers (Node side), plugin entry path, capture env (`SKILLHUB_CAPTURE_DIR`), `ROUTER_DESCRIPTION`/`estimateTokens` (Token accounting).
- Produces: an E2E suite with two always-on assertions (sandbox `debug skill` presence + no leakage) and two `SKILLHUB_LIVE=1`-gated LLM assertions (budget measurement; discover→load in ≤2 tool calls).

- [ ] **Step 1: Write the E2E suite**

`packages/plugin/test/e2e-plugin.test.ts`:

```ts
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
    const result = runOpencode(sb, ["run", "--command", "skills", "-m", "deepseek/deepseek-flash"], { SKILLHUB_CAPTURE_DIR: capture })
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
      ["run", "-m", "deepseek/deepseek-flash", "Find the best skill for deterministic fixture data using skillhub_search, then load it with skillhub_load. Reply with the skill id only."],
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
```

- [ ] **Step 2: Run the E2E**

Run: `npx vitest run packages/plugin/test/e2e-plugin.test.ts`
Expected: always-on parts pass; LLM parts skipped (no `SKILLHUB_LIVE`).

Then run live once locally:

Run: `$env:SKILLHUB_LIVE="1"; npx vitest run packages/plugin/test/e2e-plugin.test.ts`
Expected: all pass; report the captured numbers (L0+L1 tokens, tool-call sequence, stdout).

- [ ] **Step 3: Full suite + typecheck**

Run: `npm test` and `npx tsc --noEmit`
Expected: all green.

- [ ] **Step 4: CI check**

No workflow change should be needed (`npm test` covers the plugin package; LLM parts self-skip). Verify `.github/workflows/ci.yml` still runs `npm test` and note in the report that plugin always-on E2E runs on both OS legs.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin/test
git commit -m "test(plugin): sandboxed E2E — containment, budget, discover→load in ≤2 tool calls"
```

---

## Phase 2 acceptance mapping (spec §12 / §13)

| Spec requirement | Where |
|---|---|
| Router + load tools (L0/L2) | Tasks 2, 3, 4 |
| Tier management (managed dir, budget) | Tasks 5, 6, 7 |
| Toasts (updates/promotions) | Tasks 5, 7 |
| `/skills` command | Tasks 5, 7 |
| Permissions (load ask) | Task 4 |
| Promotion loop (usage → proposals) | Task 6, surfaced in Task 5/7 |
| Discover→load ≤2 tool calls (SC3) | Task 8 (live-gated) |
| Advertised overhead ≤ ~1k tokens (SC2) | Tasks 2, 5, 8 (measured) |

Deferred to Phase 3+: LLM rubric + calibration, embeddings/trending, live-source wiring, dashboard, v2 alignment, npm publication of the plugin (dev-loaded from the repo throughout Phase 2).
