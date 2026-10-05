# SkillHub — "Opencode on Steroids" v1 Roadmap

> Stage roadmap. Each slice gets its own implementation plan before it starts (writing-plans scope rule). Slice 1's plan is `2026-10-05-skillhub-steroids-slice1-dashboard.md`.

**Goal:** Take SkillHub from a working engine you operate from a terminal to a self-running skill layer: a clickable `/skillhub` dashboard command, lazy always-available server, 03:00 UK daily sync, automatic prompt-time retrieval, upgrade notifications, and a public repo — so opencode gets the best skills it needs automatically, without user babysitting.

**Positioning (user decision):** "Opencode on Steroids" as the tagline. Technical package stays `opencode-skillhub`. No selling; public release to show work. Motive text drafted for the README at the packaging slice.

## The context model (locked)

| Tier | Contents | Where | Context cost |
|---|---|---|---|
| Catalog | 10k+ scored skills | `catalog/index.json` + `search.db` | 0 tokens; local search in ms |
| Installed | 100s of pinned skills | `store/<id>/` | 0 tokens idle; `skillhub_load` reads from here on demand |
| Retrieved | every skill that clears the match threshold, up to the retrieval budget | injected by retrieval | budget-capped; the count is **emergent** (often 0, sometimes several); loaded bodies persist for that session |
| Advertised | the always-on handful | `managed/` | ~68 tokens each; keep at 0–2 with good retrieval |

**Why "advertised" exists:** it is opencode's native skills scan — any skill inside a scanned folder gets its name + description shown in every prompt and can auto-invoke without help. `managed/` holds the few always-consider skills; `store/` (the installed long list) sits deliberately **outside** the scan, so hundreds of installed skills cost zero tokens until retrieval or the router reads a body.

**Measured today (59 skills, 1 active): 0.39 MB store; 251/1000 advertised tokens.** Projections: 1k ≈ 8 MB · 10k ≈ 60 MB · 35k ≈ 200 MB. Scale gates are git churn and sync RAM (10k+), with fixes already designed (release-asset search.db, SQLite-first later).

## Locked decisions

- Personal-first; public repo at the packaging slice (activates CI, catalog-sync, Pages).
- Lazy dashboard server (starts on command use); no Docker ever needed for personal use.
- Windows Scheduled Task daily at **03:00 local (UK)**; `StartWhenAvailable` so a missed 3am runs on next wake.
- `/skills` stays the status command; **`/skillhub` opens the dashboard** (the "button" — commands are the only clickable surface the plugin API exposes).
- Proactive retrieval default mode `suggest`; `auto` opt-in.
- Ranking quality: heuristic-first for the public catalog v1; LLM rubric optional later.
- Plan additions from the context-model discussion: **bulk install** (dashboard multi-select; install-by-goal-profile) and **installed-first retrieval** (prefer pinned local copies; show provenance in results).

## Slices

| Slice | Deliverable | Acceptance | Plan | Status |
|---|---|---|---|---|
| **0 — hygiene + design** | small_model fix (done), demo cleanup (done), taxonomy/coverage design session | design doc for category model + coverage map + naming check | after Slice 1 | — |
| **1 — button + lazy server + 3am sync** | `/skillhub` command, plugin lazy server, Windows task | command opens dashboard; task registered, 03:00 UK, runs unattended, logged | **this plan** | — |
| **2 — proactive retrieval** | prompt-time match (embeddings+FTS), `off/suggest/auto`, caps, telemetry | fresh-session prompt surfaces the right library skill automatically; false-positive rate measured | design pass first | **Done 2026-10-05** (plan: 2026-10-05-skillhub-steroids-slice2-retrieval.md) — precision 10/10 top-3 (10 natural prompts, minScore 0.35); vector delta sync embedded 0, reused 59 (gemini-embedding-001 @ 768); 3-pointer block 183 est. tokens (real top-3; ≤195 on the longest real descriptions) |
| **3 — upgrade suggestions + notifications** | sync computes cluster-champion vs active deltas; startup toast + review queue entries | simulated better newcomer → toast + review entry; no auto-swap | after 2 | — |
| **4 — taxonomy & coverage build** | goal profiles, coverage map view, gap report | dashboard shows % covered and gaps per goal profile | from Slice 0 design | — |
| **5 — packaging + public release** | one-command install, bundled plugin/CLI, README + motive, license review, public repo, CI + Pages | clone → install → skills working in one command; repo public; gallery live | after 4 | — |
| **6 — quality levers (optional)** | golden-set labeling, live rubric pass | calibration target met; rubric cached | on demand | — |

## Open items carried

- Final public repo name (working title only) + trademark glance before launch.
- License review for catalog redistribution (code MIT; catalog snapshots as release assets until cleared).
- Auto mode threshold tuning (Slice 2 design).
- Bulk-install UX details (Slice 4 with coverage profiles).
