# SkillHub — Dynamic Skill Layer for opencode

- **Date:** 2026-10-05
- **Status:** Phase 0 complete (2026-10-05). Probe report: `docs/superpowers/probes/2026-10-05-phase0-probes.md`. Implementation plan: `docs/superpowers/plans/`
- **Working name:** SkillHub (provisional — collides conceptually with skills-hub.ai; rename before any public release; renaming a local folder/package now is cheap)
- **Target:** opencode 1.18.18 (v1 config semantics) today; v2-ready by design

---

## 1. Problem & thesis

The agent-skills ecosystem now has tens of thousands of `SKILL.md` skills across GitHub and several third-party marketplaces (agentskills.codes ~35k, mdskill.dev ~32k, skills-hub, awesome-lists). The ecosystem has no reliable layer for:

1. **Discovery** — finding the best skill for a task rather than the first one.
2. **Ranking** — stars measure repos, not the quality of a specific skill.
3. **Provenance & trust** — skills are instruction payloads; there is no pinning, scanning, or review story.
4. **Freshness** — installed skills silently go stale; updates are manual.
5. **Context economy** — every advertised skill costs tokens on every request; the long tail cannot be loaded wholesale.

**Thesis:** Build the missing layer as an *external* system that plugs into stock opencode. Do **not** fork opencode. The moat is the curation pipeline (sources → gates → evaluation → ranking → provenance → updates) and its integration, not the client shell. A fork is deferred indefinitely (only revisited if a branded/native-UI product is later justified).

---

## 2. Goals / Non-goals

### Goals

- **G1 — Capability on demand:** at any moment, the agent can reach the best available skill for the task, from a library of tens of thousands, without the user hunting through GitHub.
- **G2 — Bounded context:** constant advertised-skill overhead (≤ ~1,000 tokens steady state) independent of library size; skill bodies enter context only when used.
- **G3 — Trustworthy by default:** every install/update is pinned, scanned, and review-gated; nothing applies, activates, or executes silently.
- **G4 — Product-shaped:** personal-first, but the catalog is hosted-ready, cross-agent (`.agents/skills` standard), and can grow into a public gallery/service without rework.

### Non-goals (explicit)

- Forking opencode, custom TUI, or bundled desktop app (Phase 4+ decision at most).
- Redistributing upstream skill content in the MVP (installs fetch from source at pinned revision).
- Fully automatic updates (locked decision: **notify + review before apply**).
- Human review of every skill (curation is exception-based; machines score, humans spot-check).
- Covering _literally every_ skill on GitHub (impossible; candidate-pool strategy instead — see §6.1).

---

## 3. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Layer, not fork** — CLI + opencode plugin + catalog pipeline | Survives opencode releases (repo ships weekly); fork = permanent rebase tax; moat is curation |
| D2 | **Composite ranking**, stars capped at 10% | Stars measure repos, not skills; quality comes from reading the SKILL.md against a rubric |
| D3 | **Notify + review before apply** for every update/activation | Skills are instruction-injection vectors; silent auto-update is a supply-chain risk |
| D4 | **Tiered context (L0–L3)** — router, active set, indexed library, quarantine | Constant context cost, full library reachable |
| D5 | **Source-pinned, hash-verified installs** (no rehosting in MVP) | Clean provenance, no license/redistribution issues |
| D6 | **Sandboxed testing using opencode's own isolation recipe** | Zero contact with the real setup until deliberate release |
| D7 | **Dashboard after the core works** (CLI + plugin first) | UI built on a stable engine API |
| D8 | Personal-first, product-shaped | Phases gate scope; Phase 1 is useful alone |

---

## 4. Verified platform facts (opencode 1.18.18)

These were verified against docs, live APIs, and the opencode source on 2026-10-05. They are load-bearing for the design.

| Fact | Detail | Source |
|------|--------|--------|
| Skills discovery paths | Global `~/.config/opencode/skills`, project `.opencode/skills`, compatibility `~/.claude/skills`, `~/.agents/skills`; plus `skills.paths` and `skills.urls` in config | opencode docs (v1) |
| `skills.urls` catalog format | Base URL + `index.json`: `{ "skills": [{ "name", "files": [...], "version"? }] }`; files fetched from `<base>/<name>/<file>`; entry must include `SKILL.md` in `files`; cached at `Global.Path.cache/skills/<name>` with `.opencode-version`; refresh **only when `version` changes** (omitted version ⇒ never refreshed); atomic stage/backup swap | `packages/opencode/src/skill/discovery.ts` @ v1.18.18 |
| No hash verification in URL loader | The native loader does not verify hashes ⇒ CLI hash-verified install remains the primary path; URL catalog is a bonus channel for artifacts we control | same |
| Plugin surface | Local TS/JS plugins (`.opencode/plugins/`, `~/.config/opencode/plugins/`) or npm via `plugin: [...]`; hooks include `config` (mutate merged config at startup), custom `tool`, `event`, `tui.toast.show`, `tui.command.execute`, `command.execute.before`, `tool.execute.before/after`, `permission.ask`, `experimental.chat.system.transform`; `client` SDK + `$` shell in plugin ctx | opencode docs (plugins) |
| Skill permissions | `skill` permission key with per-ID allow/ask/deny | opencode docs + customize-opencode skill |
| Tool output truncation | Default 2,000 lines / 51,200 bytes; oversized output is written to disk and a preview + path returned; configurable via `tool_output` | `packages/opencode/src/tool/truncate.ts`, `packages/core/src/tool-output-store.ts` |
| Test isolation recipe | `OPENCODE_TEST_HOME` pins `os.homedir()`; `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`; `OPENCODE_CONFIG_CONTENT`; `OPENCODE_DISABLE_PROJECT_CONFIG`; `OPENCODE_PURE`; `OPENCODE_TEST_MANAGED_CONFIG_DIR`. `opencode db path` exists for DB assertions | opencode's own test helpers (`test/lib/cli-process.ts`, `test/preload.ts`), `packages/core/src/global.ts` |
| Config is not hot-reloaded | Config-time files need a restart to take effect; **tool-injected content does not** ⇒ mid-session skill loading goes through the plugin tool, not config changes | customize-opencode skill |
| External skill ancestor walk | Besides `global.home` scans, `.claude`/`.agents` dirs under cwd ancestors are scanned from cwd **up to the git worktree root** (filesystem root when outside a repo). `.agents` is always scanned unless `OPENCODE_DISABLE_EXTERNAL_SKILLS=1`; `.._CLAUDE_CODE_SKILLS=1` removes `.claude` only | `skill/index.ts` @ dev + Phase 0 matrix (probe report §7) |
| Plugin config-hook injection | A plugin's `config` hook can append `skills.paths` and discovery honors it; `OPENCODE_PURE=1` skips all file + npm plugins | Phase 0 probes 1A–1D |
| opencode v2 | `skills` array with HTTP catalogs (same `index.json` format), permissions array form, `metadata.opencode/autoinvoke` | opencode v2 docs |

---

## 5. Architecture

### 5.1 Components

```
┌────────────────────────── CI (GitHub Actions, free) ───────────────────────────┐
│  catalog pipeline:  sources → normalize → gates → scan → evaluate → score      │
│                     → cluster/taxonomy → publish artifacts                     │
└────────────────────────────────────────────────────────────────────────────────┘
                 │ publishes (Pages / release assets)
                 ▼
        catalog/index.json · trending.json · clusters.json · search.db
                 │ consumed by
                 ▼
┌──────── Local machine ────────┐        ┌────────────── opencode ──────────────┐
│  skillhub CLI                 │        │  skillhub plugin                     │
│  search/info/why/install/     │◄──────►│  · toast on updates/alternatives     │
│  update/review/activate/      │(files) │  · /skills command                   │
│  deactivate/remove/list/ui    │        │  · router + load custom tools        │
│  lockfile · overrides · store │        │  · reads catalog cache + lockfile    │
└───────────────────────────────┘        └──────────────────────────────────────┘
```

- **Catalog pipeline** — batch, deterministic where possible; runs daily in CI; only touches public data.
- **CLI** — local engine: catalog cache, lockfile, installer (fetch → verify → materialize), review/diff engine, tier management. Node-based, Windows-first.
- **Plugin** — thin opencode integration: file reads + one custom tool family + toasts/commands. No business logic duplication.

### 5.2 Repo layout

```
SkillHub\
├─ packages\
│  ├─ catalog\      # sources/, normalize/, score/, cluster/, publish/  (runs in CI)
│  ├─ cli\          # `skillhub` binary (Node/Bun, cross-platform)
│  └─ plugin\       # opencode plugin (npm: opencode-skillhub, provisional name)
├─ catalog\         # generated artifacts (JSON snapshots committed; search.db = release asset)
├─ docs\superpowers\         # specs\, plans\, probes\ (this spec; plans + probe reports land here)
└─ .github\workflows\        # catalog-sync.yml, ci.yml
```

### 5.3 Core flows

1. **Sync (daily):** sources → candidate records → content fetch at revision → gates → static scan → LLM rubric (delta-only, content-hash cached) → composite score → cluster assignment → artifacts published.
2. **Discover (agent, mid-session):** router tool search → top-5 results → optional `load` → permission `ask` → body injected into conversation (≤50 KiB / 51,200 bytes = opencode's tool-output cap; larger via saved file + path) → optional "activate for future sessions" toast.
3. **Install (human):** `skillhub install <id>` → resolve source at pinned revision → fetch + hash verify → write to store (inactive) → lockfile entry → optional activate.
4. **Update (notify + review):** sync detects upstream change → plugin toast → `skillhub review` shows diff + risk delta → approve → new revision applied → lockfile updated.
5. **Promotion (learning loop):** repeated use of a library skill in a project → candidate for L1 promotion → toast → user approves → skill enters that project's active set.

---

## 6. Catalog pipeline

### 6.1 Sources

| Source | Access | Signals | Notes |
|--------|--------|---------|-------|
| agentskills.codes API | Public, no auth, read-only (`/api/v1/skills`, OpenAPI 3.1). Search returns id/slug/name/author/description/category/views/installs. Zip download endpoint `/api/skills/download/{id}`. **No `sourceUrl` in schema** despite docs example | popularity (installs/views), category | Provenance gap ⇒ content-hash pinning tier for these entries |
| GitHub topics | REST `search/repositories?q=topic:<t>`; verified live: `topic:claude-skills` = 9,974 repos; fields incl. `stargazers_count`, `pushed_at`, `created_at`, SPDX `license`, `topics[]`, `archived`, `default_branch` | stars, velocity, license, maintenance | Topics: `claude-skills`, `agent-skills`, `opencode-skills`, `codex-skills`, `cursor-skills`, `antigravity-skills`, `gemini-cli-skills`, … |
| GitHub trees | `git/trees?recursive=1` per candidate repo → all `SKILL.md` paths + blob SHAs; raw.githubusercontent.com for content (no API cost; immutable at pinned SHA) | file integrity, content | ~2k repos ≈ ~2k calls; daily CI with PAT (5,000 req/hr auth) is ample |
| GitHub code search | `search/code?q=filename:SKILL.md`; **requires auth** (verified 401 anonymous); 1,000-result cap; 10 req/min | long-tail top-up only | Supplement, not backbone |
| mdskill.dev | CLI auth-gated (`~/.mdskill/config.json`); public leaderboard pages show security score + repo + stars | security score, category | Optional cross-check; ToS check before programmatic use; own scanner is primary |
| Awesome lists (e.g., ComposioHQ/awesome-claude-skills) | Plain repos | curated candidates | Cheap, high-precision seeds |
| skills-hub-registry (tinh2) | GitHub repo, daily-synced | breadth | Optional source |

**Candidate-pool strategy:** exhaustive GitHub enumeration is impossible and unnecessary. Overlapping pools (marketplaces + topics + code search + awesome lists) give broad coverage; reconciliation (§6.6) makes gaps visible.

**Trending:** no official GitHub trending API. Compute it: daily star snapshots per repo → 7d/30d velocity; plus "new this month" repos (`created_at` filter); plus marketplace trending lists. We own the signal; no scraping of undocumented pages.

### 6.2 Normalization — `SkillRecord`

```
id                 # stable: <repo-or-author>/<skill-dir-name> slug
name, description_raw, summary_derived
category           # canonical taxonomy (§8)
tags[]             # normalized from frontmatter metadata, repo topics, marketplace
cluster_id, cluster_label
source: { repo?, path, ref (commit SHA), url?, license (SPDX), license_flags[] }
files:  [{ path, sha256, size }]
content_hash       # hash of canonical SKILL.md content
requires: { runtime[], scripts[], mcp[], env[], services[] }   # §8.4
risk:   { level, findings[] }                                   # §10.2
signals: { stars, star_velocity_30d, forks, installs, views, pushed_at, created_at, archived }
scores: { total, quality, trust, freshness, compatibility, adoption, breakdown, rubric_version, evaluated_at }
provenance_tier: "sha-pinned" | "content-hash-pinned" | "local"
status: "candidate" | "active" | "quarantined" | "blocked"
relations: { supersedes[], duplicates[], alternatives[] }
```

### 6.3 Gates (elimination — before scoring)

1. Parses as valid markdown/frontmatter; name + description present (else LLM-derivable description, flagged).
2. Repo not archived/abandoned (pushed within N months, default 18; N configurable; pinned user skills exempt).
3. License known or explicitly flagged unknown.
4. Referenced files exist in the tree.
5. Static scan not catastrophic (explicit exfiltration / instruction-override patterns → `quarantined`, visible for review, never silently dropped).

### 6.4 Composite score

| Component | Default weight | Computation |
|-----------|----------------|-------------|
| Quality | 35% | LLM evaluator reads full SKILL.md + file list against a fixed rubric: description triggers (what+when), instruction clarity, structure/workflow, completeness, scope discipline, examples, safety. Stored with written reasoning (auditable via `skillhub why`) |
| Trust | 25% | Deterministic scan findings (§10.2), publisher reputation (known orgs/verified), license clarity, injection surface |
| Freshness | 15% | Commit recency (time-decayed), maintenance cadence, alive after convention changes |
| Compatibility | 15% | Valid tool/MCP references, no missing deps, cross-platform (incl. Windows), no broken file links |
| Adoption | 10% | stars/forks/installs/views — **log-scaled, age-normalized (velocity), capped per repo**; popularity prior only |

- Weights are configuration; final values set by golden-set calibration (§7.4).
- **Delta-only evaluation:** LLM rubric runs only on new or content-changed skills; cached by `content_hash` + `rubric_version`. Re-run only when either changes.
- **Anti-gaming:** near-identical copies (forks/generator clones) collapse into one cluster — canonical entry ranks, copies link to it; star spikes without forks/issues/contributors are flagged via snapshot deltas; the rubric reads content, so keyword-stuffed descriptions gain nothing.

### 6.5 Clustering & taxonomy

See §8.

### 6.6 Publishing & reconciliation

Artifacts:

- `index.json` — full library with scores and provenance.
- `trending.json` — star velocity + new-this-month + marketplace trending.
- `clusters.json` — best-per-cluster map with alternatives.
- `search.db` — SQLite (FTS5 + vector index) for the CLI/router; published as a release asset (not committed to git).

**Reconciliation checks (anti-"miss"):** per-source last-seen timestamps and record counts; catalog diff vs previous snapshot (new/removed/changed counts); alerts when a source grows faster than ingestion (e.g., marketplace total jumps >X% without matching intake). Gaps become visible items in the review queue, not silent omissions.

---

## 7. Ranking & "best skill" selection

### 7.1 Gates → score → rank

Candidate → gates (§6.3) → composite score (§6.4) → rank within cluster.

### 7.2 Best-skill selection

1. Embed (name + description + tags) → cluster.
2. Rank by composite within cluster; "best" = rank 1.
3. If rank 1–2 are within ~5 points → return both as alternatives ("too close to call"), never fake certainty.
4. Rule of least churn: never recommend replacing an installed working skill unless the challenger wins by a real margin (default ≥15 points) or the incumbent has a new security finding or freshness failure.
5. Human inputs outrank the algorithm: pins, blocks, category/score overrides (§7.5).

### 7.3 Ranker evaluation (is the ranking any good?)

- Golden set: 30–50 hand-labeled skills across clusters in quality tiers; measure rank agreement (Spearman correlation); tune weights/rubric against measurements.
  - Calibration tooling shipped in Phase 3 (`skillhub label export/import` + `skillhub calibrate --apply`, validated on constructed fixtures); the user labeling session (30–50 real skills) produces the golden set, sets the final calibration target, and applies the calibrated weights.
- `skillhub why <id>` exposes component scores + evaluator reasoning text.

### 7.4 Calibration

One-time labeling session (a few hours of user time) → golden set → calibrate weights + rubric prompts → re-check after each rubric-version bump.

### 7.5 Overrides

`~/.config/opencode/.skillhub/overrides.json`: pin/block/promote/category/score adjustments; always wins over computed values.

---

## 8. Taxonomy: categories, subjects, requirements

### 8.1 Canonical categories (stable, ~12)

Engineering · Testing · Design & UI · Writing · Data · Research · Marketing & Growth · Business & Finance · Docs & Productivity · Security · Media & Creative · Infrastructure & DevOps.

Mapping from marketplace categories (which differ: agentskills has 9, mdskill ~7) via rules + LLM classifier fallback; stored with confidence; manual overrides allowed.

### 8.2 Tags / subjects

Normalized from frontmatter `metadata`, repo topics, marketplace tags; lowercase kebab; alias table merges synonyms.

### 8.3 Clusters

Embeddings → community detection (k-means/HDBSCAN over name+description+tags) → LLM-generated cluster labels ("PDF manipulation", "brand voice", "SEO audit"). Refreshed each sync using centroid matching for stable IDs; cluster map published in `clusters.json`.

### 8.4 Requirements extraction ("what is needed")

Parsed from SKILL.md + file list:

- `runtime[]` — node/python/bun/etc.
- `scripts[]` — bundled executable files.
- `mcp[]` — referenced MCP tools/servers.
- `env[]` — API keys / env vars referenced.
- `services[]` — external services (GitHub, Figma, …).

Surfaced in `skillhub info` and install warnings; feeds Compatibility scoring.

### 8.5 Descriptions

Source of truth: YAML frontmatter `description`. Fallback chain: frontmatter → first body paragraph → marketplace description → LLM-derived summary. Derived summaries live **only in the catalog/router index**; upstream files are never rewritten. L1 promotion prefers skills whose original description is strong; license-gated description overrides in our own managed copies are a later, clearly-flagged option.

---

## 9. Context economy & library control

### 9.1 Tiers

| Tier | Content | Context cost | Mechanism |
|------|---------|--------------|-----------|
| **L0 — Router** | `skillhub_search` tool (description carries a ~15-entry capability map + "search before non-trivial tasks") + optionally 1 meta-skill | ~150–300 tokens, constant | Plugin custom tool (+ optional skill) |
| **L1 — Active set** | ≤10–15 project-relevant skills, fully advertised | budgeted so **L0 + L1 ≤ ~1,000 total** | Managed dir registered via `skills.paths`; promotion rules below |
| **L2 — Library** | Everything (~tens of thousands) | 0 until used | SQLite FTS5 + vector search; top-5 one-liners on query; body only via `load` |
| **L3 — Quarantine** | Failed gates / suspicious skills | 0 | Dashboard/CLI view only |

Budget check: Phase 0 measured a 70-skill verbose block at ~35.7k chars ≈ **~8.9k tokens** (~510 chars/skill incl. location; ~358 chars without). SkillHub bounds the advertised surface at ~1k tokens regardless of library size: if the L1 set would exceed the L0+L1 budget, the least-used skills are demoted to L2 (the router still reaches them). At measured averages a 1k budget fits **~8–10 verbose skills** — budget first, count second; hard-enforced in tests (SC2).

### 9.2 Loading mechanics

- Search returns top-5 `{id, name, summary, score, category}` — no bodies.
- `load` injects the full SKILL.md into the conversation (tool result; ≤50 KiB passes unchanged; larger is saved to disk with path hint — verified truncation behavior).
- Config-time files need restart; **tool injection does not** ⇒ mid-session loading works in 2 tool calls.
- New loads default to permission `ask` (custom tool permission) + risk summary shown in the result.
- "Activate for future sessions" is offered after load; activation writes the skill into the advertised set (restart note surfaced).

### 9.3 Promotion & learning loop

- Track (project, skill) usage; frequently used library skills become L1 promotion candidates (toast → approve).
- L1 stays stable within a session for prompt-caching friendliness; changes happen at promotion/install time.
- Deactivation moves the skill back to the store.

### 9.4 Migration of existing external skills

- Your existing `~/.agents/skills` and `~/.claude/skills` remain advertised until adopted.
- Adoption flow: `skillhub adopt <path>` → copies into store with `provenance_tier: local`, lockfile entry, optional `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` + `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1` to hand full context control to SkillHub.
- Nothing is moved/deleted without explicit adoption commands.

### 9.5 Library control & "don't miss things"

- **Review queue** (dashboard + `skillhub review`): new-this-week top candidates, pending updates, quarantined items, reconciliation gaps. Designed for ~20 items/week exception-based triage.
- **Views:** category / cluster / score / freshness / provenance / risk / installed / updates / quarantined.
- **Versioned catalog snapshots:** daily artifacts are diffable; any change is revertible.
- **Coverage checks:** §6.6.

---

## 10. Trust & safety

### 10.1 Pinning tiers

| Tier | When | Pin |
|------|------|-----|
| `sha-pinned` | Source repo known | Git commit SHA + file sha256 hashes |
| `content-hash-pinned` | No source repo (marketplace zip-only) | sha256 content hash recorded at install |
| `local` | User's own/adopted skills | Local hash; provenance noted |

### 10.2 Static scan (deterministic)

Categories: prompt-injection patterns (instruction override, hidden text), exfiltration shapes (read secrets → network), shell invocation, filesystem writes outside skill dir, credential/env access, network calls, obfuscation. Output: findings list + risk level; catastrophic findings → quarantine (never silent).

### 10.3 Review-before-apply

- All installs, updates, and activations are notify + review + approve.
- Diffs shown as file-level changes + risk delta + score delta.
- `skill` permission stays `ask` for new/unverified IDs until approved.

### 10.4 Content integrity

Upstream files never rewritten (except future, license-gated, flagged description overrides in our own copies). Derived data lives beside, not inside, source content.

---

## 11. Isolation & testing

### 11.1 Sandbox recipe (opencode's own; verified)

Every test/scripts process runs with:

```
OPENCODE_TEST_HOME=<sandbox>          # pins os.homedir()
HOME=<sandbox>
XDG_CONFIG_HOME=<sandbox>/.config
XDG_DATA_HOME=<sandbox>/.local/share
XDG_STATE_HOME=<sandbox>/.local/state
XDG_CACHE_HOME=<sandbox>/.cache
OPENCODE_CONFIG_CONTENT=<inline test config>   # where applicable
OPENCODE_DISABLE_PROJECT_CONFIG=1              # per-test as needed
OPENCODE_PURE=1                                # per-test as needed
OPENCODE_DISABLE_EXTERNAL_SKILLS=1
OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1
```

- Harness **guard**: abort if resolved home is not under the sandbox path (hard backstop against touching the real profile).
- **External-scan containment (Phase 0 finding):** `OPENCODE_TEST_HOME`/`HOME`/XDG do **not** bound the cwd-ancestor walk (cwd → git worktree root). Negative-isolation tests must set `OPENCODE_DISABLE_EXTERNAL_SKILLS=1`, or materialize the sandbox fixture root as a git repo (walk stops there); `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1` removes `.claude` only. `USERPROFILE` overrides do nothing.
- Dev plugin loads from the test project (`plugin: ["./skillhub-dev.ts"]` / `.opencode/plugins/`) — never installed globally during development.
- CLI takes `--root` / `SKILLHUB_HOME` + dry-run mode; tests always pass the sandbox root.

### 11.2 Test ladder

| Layer | Proves | Tooling |
|-------|--------|---------|
| Unit | ingest/score/cluster, lockfile, diff engine | Vitest 4 + fixture skills |
| Component | plugin hooks, tool wiring, toast logic | Vitest + mocked SDK client |
| E2E (no LLM) | opencode resolves managed skills; install/activate behave | spawn `opencode` headless in sandbox; assert resolved skills + filesystem + `opencode db path` |
| E2E (LLM, budgeted) | benchmark: "a skill exists — does the agent find it unaided?" | sandbox + cheap model; session logs inspected; on-demand, budget-capped |
| Dashboard (Phase 4) | UI flows + a11y | Playwright 1.63 + axe against a generated fixture store |

CI matrix: `ubuntu-latest` (main) + `windows-latest` (junction/path logic).

### 11.3 Phase 0 probes (completed 2026-10-05; results: `docs/superpowers/probes/2026-10-05-phase0-probes.md`)

1. Project-local plugin loading under the sandbox env (`plugin: ["./dev.ts"]`, `.opencode/plugins/`, `OPENCODE_PURE` interaction).
2. Headless `opencode run` invocation + session/log locations; confirm `opencode db path`; identify a no-LLM assertion path for E2E tests (e.g. `opencode serve` config/skills endpoint or config-hook marker file).
3. Exact `skill` permission syntax and custom-tool permission shape on 1.18.18 (schema).
4. Baseline token measurement of the current advertised-skills block.
5. `skills.urls` smoke test with a locally served `index.json` catalog (download, cache, version-bump refresh).
6. LLM rubric cost measurement on the chosen cheap model (delta-only estimate).

---

## 12. Roadmap

| Phase | Deliverable | Done when |
|-------|-------------|-----------|
| **0 — Probes** (½ day, sandbox) | §11.3 list resolved | **Done 2026-10-05** — no unknown platform behavior remains |
| **1 — Catalog + CLI MVP** | Sources 1–3 ingest, gates, static scan, static catalog, `search/info/why/install/update/review/list`, lockfile | A real skill is installed pinned from the catalog and opencode loads it |
| **2 — Plugin + router** | Toast, `/skills`, router + load tools, permissions, tier management, promotion loop | Mid-session discover→load in ≤2 tool calls; advertised overhead ≤ ~1k tokens measured |
| **3 — Ranking depth** | LLM rubric + calibration, clusters/taxonomy, requirements extraction, trending, reconciliation, live sources | **Done 2026-10-05** — `catalog:sync` ingests live sources; rubric is delta-only + hard-capped; calibration tooling + labeling flow shipped and validated on constructed fixtures; the provisional target (ρ ≥ 0.7) applies to the user's 30–50-skill golden set, labeled in the pending session (see §7.3) |
| **4 — Dashboard + productize** | `skillhub ui` (status/gallery/clusters/trending/review/detail) + read-only static export, live `catalog-sync` workflow, Pages deploy workflow, README | **Done 2026-10-05 (Phase 4 plan)** — actions stay CLI-engine-backed; static gallery is deployable once Pages is enabled; npm packaging still waits on the final name decision |
| **5 — v2 alignment** | Emit v2-compatible native catalog channel; v2 permissions/autoinvoke support | Works on opencode v2 |

---

## 13. Success criteria

- **SC1:** Installing a catalog skill produces a pinned, hash-verified, provenance-recorded entry that opencode loads.
- **SC2:** Advertised-skill context overhead ≤ ~1,000 tokens steady state, measured before/after.
- **SC3:** Agent discovers + loads a relevant library skill mid-session, unaided, in ≤2 tool calls; benchmark find-rate tracked and improving.
- **SC4:** Ranker agreement with golden-set labels meets the calibration target (set during Phase 3).
- **SC5:** Zero sandbox/isolation escapes across the whole test suite.
- **SC6:** Update flow always presents diff + risk delta before applying; no silent changes possible.
- **SC7:** Steady-state running cost (CI + LLM eval) within budget: CI $0, eval single-digit $/month after backfill (one-off backfill est. $20–60, staged).

---

## 14. Open items & risks

### Open items

- Phase 0 probes (§11.3).
- Final name (collision: skills-hub.ai; pick before publishing; local rename is cheap).
- mdskill ToS for any programmatic use (optional source).
- License review before Phase 4 public hosting/mirroring (MVP does not redistribute).
- Golden-set labeling session (user time, Phase 3).

### Risks (with mitigations)

| Risk | Mitigation |
|------|------------|
| Ranking quality is genuinely hard; "best" is judgment, not fact | Golden-set calibration; alternatives on close calls; human overrides outrank; never fake certainty |
| Slop flood of AI-generated skills | Gates + rubric + cluster dedupe; review queue surfaces; quarantine tier |
| Dedupe/canonicalization bugs across copies | Content hashing + embeddings; canonical links; regression tests |
| Provenance gaps (marketplace entries without source repos) | Two-tier pinning (`content-hash-pinned`); prefer provenance-complete candidates in promotion |
| opencode upgrades break the plugin layer | Adapter isolation; compat check; v2 alignment phase; pinned supported versions |
| Star/installs gaming | Log-scaled, capped 10%, velocity-normalized; snapshot spike detection |
| Context creep over time | Hard budget in tests (SC2); L1 cap enforced by CLI |
| Supply-chain via skill updates | Notify + review; pinning; static scan; `ask` permissions |

---

## 15. Glossary

- **SKILL.md** — the agent-skills convention: a folder with `SKILL.md` (YAML frontmatter + instructions) plus optional scripts/references.
- **L0/L1/L2/L3** — router / active set / library / quarantine tiers.
- **Router** — the always-advertised tool that searches the library.
- **Store vs active** — installed-but-unadvertised vs registered-with-opencode.
- **Golden set** — hand-labeled skills used to calibrate the ranker.
- **Provenance tier** — how an installed skill is pinned (sha / content-hash / local).
