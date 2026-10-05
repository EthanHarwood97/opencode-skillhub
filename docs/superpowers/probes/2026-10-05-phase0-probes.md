# SkillHub — Phase 0 probe report

- **Date:** 2026-10-05
- **Environment:** opencode 1.18.18, Windows_NT 10.0.26200 (x64), Node v22.23.2, pwsh 7
- **Sandbox:** `E:\Users\ethan\AppData\Local\Temp\opencode\skillhub-p0` (isolated HOME/XDG; real `auth.json` copied in so live LLM probes could run; no secrets were read into logs or outputs)
- **Sources used:** opencode published config schema (`https://opencode.ai/config.json`), opencode source `packages/opencode/src/skill/index.ts` + `skill/discovery.ts` @ `anomalyco/opencode` `dev` (2026-10-05), live behavior on 1.18.18
- **Spec under test:** `docs/superpowers/specs/2026-10-05-skillhub-design.md` §11.3

All six probes are resolved. Two findings change the design's test recipe (sandbox external-skill leak; plugin config-hook can register the L1 managed dir); one finding recalibrates the context budget math.

---

## 0. Sandbox harness (as executed)

```
OPENCODE_TEST_HOME=<sandbox>/home
HOME=<sandbox>/home
XDG_CONFIG_HOME=<sandbox>/home/.config
XDG_DATA_HOME=<sandbox>/home/.local/share
XDG_STATE_HOME=<sandbox>/home/.local/state
XDG_CACHE_HOME=<sandbox>/home/.cache
# per-test:
OPENCODE_PURE=1                      # plugin kill-switch test
OPENCODE_DISABLE_EXTERNAL_SKILLS=1   # external-skill kill-switch (negative isolation)
```

`opencode debug paths` confirmed every global path (data/log/cache/config/state) resolved inside the sandbox; `opencode db path` → `<sandbox>/home/.local/share/opencode/opencode.db`. `--pure` CLI flag and `OPENCODE_PURE=1` exist; `--print-logs`/`--log-level` available on all commands.

---

## 1. Plugin loading (project-local)

Fixtures: `proj/opencode.json` with `plugin: ["./skillhub-dev.ts"]`, plus auto-discovered `.opencode/plugins/auto-dev.ts`; both write markers from the `config` hook.

| Test | Setup | Result |
|------|-------|--------|
| A | config-declared `./skillhub-dev.ts` + auto `.opencode/plugins/auto-dev.ts` | Both loaded: `dev-import` + `dev-config-hook.json` + `auto-config-hook.txt` |
| B | same, `OPENCODE_PURE=1` | **0 markers** — PURE skips both config-file plugins and auto-discovered plugins |
| C | proj2 with auto-discovery only (no plugin entry in config) | `auto-config-hook.txt` written; auto-discovery works with no config declaration |
| D | proj3: plugin `config` hook appends an absolute path to `cfg.skills.paths` pointing at `shared-managed/` containing `demo-skill/SKILL.md`; run `opencode debug skill` | `demo-skill` **found** (list 70 → 71). **The plugin can register the managed L1 directory via the config hook** |

Config-hook payload details (test A): `cfg` keys at hook time: `$schema, agent, command, mode, plugin, plugin_origins, username`; `cfg.plugin` arrives resolved to absolute `file:///` URLs; `plugin_origins` records each entry's origin. Hook can be async; mutation is picked up by downstream loaders.

**Verdict:** config hook is a viable L1 registration mechanism; `OPENCODE_PURE=1` is a hard kill-switch for all file/npm plugins (use it in unit-ish isolation tests; not compatible with integration tests that need the plugin).

---

## 2. Headless invocation, sessions, no-LLM assertions

| Item | Result |
|------|--------|
| Headless run | `opencode run -m <provider/model> "<message>"` works non-interactively; `deepseek/deepseek-flash` returned `OK` |
| Auth failure mode | `google/gemini-2.5-flash-lite` failed with "Google Generative AI API key is missing" — only configured providers work; pick per-machine |
| Session storage | SQLite DB at `opencode.db`; tables include `session, message, part, permission, project, …`; `opencode db "<SQL>"` runs queries headlessly |
| Logs | `<data>/log/opencode.log` inside sandbox |
| Cost/tokens | `opencode export <sessionID>` → messages carry `tokens {input, output, reasoning, cache}`, `cost`, `model` |

**No-LLM E2E assertion path (better than the `serve` fallback in the spec):** `opencode debug skill` emits the full resolved skill list as JSON (name/description/location/content); combined with `opencode db "<query>"` and filesystem assertions this proves resolution without any model call. `opencode debug config`, `debug paths`, `debug info` also useful.

---

## 3. Permissions + schema

From the published JSON schema (2026-10-05) and source:

- `permission` accepts `PermissionConfig` = an action string at top level, or an object of known keys: `read, edit, glob, grep, list, bash, task, external_directory, lsp, skill` (each accepting `PermissionRuleConfig` = `"ask" | "allow" | "deny"` **or** `{ "<pattern|name>": "<action>" }`), plus flat-action keys `todowrite, question, webfetch, websearch, doom_loop`; unknown keys fall through to `additionalProperties: PermissionRuleConfig` → **custom tool names can be permission keys**.
- `skill` takes the rule-object form; source evaluates `Permission.evaluate("skill", skill.name, agent.permission)` → per-skill-ID rules like `{"skill": {"brand-kit-master": "allow", "*": "ask"}}` (docs: last matching rule wins).
- `skills` config shape confirmed: `{ paths: string[], urls: string[] }`, `additionalProperties: false`.
- Plugin custom tools: `import { tool } from "@opencode-ai/plugin"`, `tool({ description, args, execute })` under the plugin's `tool` export (docs, updated 2026-10-03).

**Verdict:** the spec's permission approach (per-skill `ask`/`allow`/`deny`, custom-tool permission gating) is fully expressible on 1.18.18.

---

## 4. Baseline advertised-skills measurement

Measured against a sandbox process that resolved 70 skills (the real external set + fixtures; block format matches `Skill.fmt(list, { verbose: true })`):

| Form | Chars | ≈ Tokens (chars/4) |
|------|-------|--------------------|
| Verbose XML block (name + description + location) | 35,698–35,736 | **~8,900** |
| Names + descriptions only | 25,038 | ~6,300 |
| Non-verbose markdown variant | 25,687 | ~6,400 |
| Full system prompt (sandbox project, includes block) | 51,600 | ~12,900 |

- Average per skill: **~510 chars (~127 tokens)** verbose; **~358 chars (~90 tokens)** name+description.
- The spec's "~80 skills ≈ 4–6k tokens" was a low estimate for the verbose format; the constant-overhead claim survives, but a 1k L0+L1 budget fits **~8–10 verbose skills**, not 10–15, unless descriptions are shorter than this user's average. Enforce the budget, float the count: budget first, count second.

Live capture was taken via the `experimental.chat.system.transform` hook (fires before model auth; writing `output.system` to disk). The hook works and is suitable for both measurement and any future system-prompt injection.

---

## 5. `skills.urls` catalog — full behavior verified

Local static server + `skills: { urls: ["http://127.0.0.1:8791/"] }`, `OPENCODE_DISABLE_EXTERNAL_SKILLS=1`:

| Step | Result |
|------|--------|
| A: `index.json` v1 (`{skills:[{name, files:["SKILL.md"], version:"1"}]}`) | Skill `url-probe` resolved; cache written to `<cache>/opencode/skills/url-probe/` with `SKILL.md` + `.opencode-version` = `1` |
| B: bump index `version` → `2`, change content | Cache refreshed to v2 (atomic stage/backup swap in source) |
| C: change content again, **no version bump** | Cache stays at v2 — **refresh only on declared version change** |

Source confirms: entry missing `SKILL.md` in `files` → warning + skipped; omitted `version` → download-once, never refresh; files fetched from `<base>/<name>/<file>`; per-skill concurrency 4, per-file 8.

**Verdict:** the spec's §4 claims hold exactly on 1.18.18. URL catalogs remain a bonus channel (no hash verification — unchanged conclusion); the CLI hash-verified install stays primary.

---

## 6. LLM rubric cost (chosen cheap model: `deepseek/deepseek-flash`)

Representative rubric prompt (evaluator instructions + one real 10.6KB SKILL.md), run via `opencode run` in the sandbox:

- Input **8,227** tokens; output 423 + reasoning 530; total 10,844
- **Cost: $0.00181 per skill evaluation**; output was valid rubric JSON (score + reasoning + flags)
- Scaling: 35k-skill backfill ≈ **$63** via this path; post-dedup canonical set + delta-only updates reduce steady state to low single-digit $/month (SC7 target stays feasible; exact model choice still open — cost is model-configurable)

Production variant note: a direct API call carrying only rubric + SKILL.md (~3k input tokens) costs less than the opencode-runner path measured here (which included opencode's base system prompt).

---

## 7. Cross-cutting finding — external skill discovery walks cwd ancestors

Not captured in the spec. Source (`skill/index.ts @ dev`) and black-box matrix prove:

- External scan = `<global.home>/.claude/skills/**` + `<global.home>/.agents/skills/**` **plus** `fsys.up({ targets: [".claude", ".agents"], start: cwd, stop: gitWorktree })` — i.e. project-relative `.claude`/`.agents` dirs are scanned walking **up from cwd to the git worktree root** (further up when not in a repo).
- `.agents` is always scanned unless `OPENCODE_DISABLE_EXTERNAL_SKILLS=1`; `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1` removes `.claude` only.
- Duplicate skill names: last scan wins, warning logged; `.agents` scanned after `.claude`.

Evidence matrix (all with full sandbox env; count = resolved skills):

| Run | cwd | Resolution | Count |
|-----|-----|------------|-------|
| R1 | neutral dir inside sandbox, no git | walk reaches real `E:\Users\ethan\.claude`/`.agents` | 70 |
| R2 | SkillHub repo (git root) | walk stops at worktree root → no leak | 2 |
| R4 | proj2 (+`USERPROFILE` sandbox override) | override has **no effect** | 70 |
| R6 | `git init`'d dir inside sandbox | walk stops at git root | 2 |
| R7 | neutral dir outside sandbox | walk reaches real home | 70 |
| R8 | fixtures in an ancestor + real home in chain | both found | 72 |
| R9 | same as R8 after `git init` at the walk root | only fixtures below git root | 4 |

**Consequences for the spec's sandbox recipe (§11.1):**
1. Negative-isolation tests must set `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` (kills global + walk scans), **or** materialize the sandbox fixture root as a git repo / place it inside one, which bounds the walk.
2. `USERPROFILE`/`HOMEDRIVE` overrides are not the lever; do not rely on them.
3. Tests that intentionally exercise external skills can use `.agents` fixtures **inside the git-bounded sandbox root** with the flag omitted; `.claude`-only disabling is insufficient.

---

## 8. Spec deltas (applied to the design doc)

1. §4: added verified rows for the ancestor-walk discovery rule and for plugin config-hook skills-path injection; PURE semantics noted.
2. §9.1: budget paragraph now carries measured baseline (~8.9k tokens for 70 skills; ~510 chars/skill) and caps L1 at ~8–10 verbose skills for the 1k target.
3. §11.1: isolation bullet — external scans are only contained by `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` or a git-rooted fixture root (USERPROFILE overrides do nothing).
4. §11.3: marked completed with a pointer to this report.
5. §4: probe 2's "no-LLM assertion path" resolved to `opencode debug skill` + `opencode db` (not `serve`).

## 9. Remaining open items (feed the implementation plan)

- Name collision check (skills-hub.ai) before any public artifact.
- mdskill.dev ToS (optional source).
- Golden-set labeling session (Phase 3, user time).
- Model choice for rubric (cost model established; pick at Phase 3).
- Windows path/junction behavior for the installer (not probed; Phase 1 test matrix item).
