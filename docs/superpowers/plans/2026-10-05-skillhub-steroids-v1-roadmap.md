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
| **3 — upgrade suggestions + notifications** | sync computes cluster-champion vs active deltas; startup toast + review queue entries | simulated better newcomer → toast + review entry; no auto-swap | 2026-10-05-skillhub-steroids-slice3-upgrades.md | **Done 2026-10-05** (plan: 2026-10-05-skillhub-steroids-slice3-upgrades.md) — acceptance 310/4 green; real store (59 skills, active understand-diff @ 85.25): computeUpgradeSuggestions → [] — top same-cluster candidate understand-chat ties at 85.25, so no alternative outranks the active skill by +5 and no toast fires |
| **4 — taxonomy & coverage build** | goal profiles, coverage map view, gap report | dashboard shows % covered and gaps per goal profile | from Slice 0 design | **Done 2026-10-05** (plan: 2026-10-05-skillhub-steroids-slice4-coverage.md) — acceptance 324/4 green; real store (59 skills): coding 30%, content 5%, research 10%, business-ops 0%, design-creative 30%; e.g. coding gaps infrastructure-devops/testing/data/docs-productivity/research/security (0/3), design-creative design-ui (1/3); bulk install loops the existing install route sequentially with one confirmation, no activation |
| **5 — packaging + public release** | one-command install, bundled plugin/CLI, README + motive, license review, public repo, CI + Pages | clone → install → skills working in one command; repo public; gallery live | after 4 | — |
| **6 — quality levers (optional)** | golden-set labeling, live rubric pass | calibration target met; rubric cached | on demand | — |
| **7 — taxonomy v2 + population** | 24 categories + 210 labels classifier; topic sweep + curated seeds; 1–3k verified population | golden set ≥90%; no category >40%; CI green | 2026-10-05-skillhub-capability-labels.md | **Done 2026-10-06** — 24 categories + 210 labels shipped (golden 60/60); live catalog re-populated to **1,108 skills** across all 24 categories (engineering share 92% → 24%); 594 rubric-scored; 7 goal profiles live; spend $0.45 of the $1.50 cap |
| **8 — nightly curator** | delta-only AI review in the 03:00 task: category corrections, quality flags, morning brief | brief on the dashboard; corrections ledgered with reasons; hard $ cap | after 7 | **Done 2026-10-06** — first pass: 125 skills curated, 55 category corrections, $0.0966 of the $0.25 cap; brief live on Status |

**Slice 5 status (2026-10-05): Done.** Public at github.com/EthanHarwood97/opencode-skillhub (MIT). One-command installer verified twice (idempotent); CI, Pages gallery and the daily live sync all green; first CI catalog run: 449 skills / 21 clusters; `search.db` published as a rolling release asset.

**Slice 6 status (2026-10-05): rubric pass done; labeling session ready.** Local catalog is 29/29 `rubric-v1` (LLM quality overrides, reasons cached); total spend $0.041 across two live runs; the delta-only cache was proven in the wild (second run: 3 evaluated, 26 cached, $0.0047). Labeling worksheet generated at `Desktop/skillhub-label-worksheet.tsv` from the live catalog — the human tier-filling session (`label import` then `calibrate --apply`) remains the last step and is deliberately user-time.

**Slice 7 status (2026-10-06): done.** Taxonomy v2 shipped (24 categories / 210 labels; classifier + labels + UI facets). Sync expanded: topic pagination/qualifiers, `seed-repos.json` (54 curated repos), 45s fetch timeouts, parallel raw fetches, concurrent (4-lane) budget-capped rubric evals with an accurate `--cost-per-eval`. Live store re-populated: **1,108 skills** (1,070 candidate / 38 quarantined), all 24 categories represented, engineering share 24% (was 92%); rubric-scored 594 (497 this pass + cache), 514 heuristic awaiting later eval passes (delta cache accumulates); vectors embedded 1,090. Goal profiles: coding 100%, content 97%, research 100%, business-ops 100%, ai-builder 100%, game-dev 95%, design-creative 92% — sole recurring gap: `art-creative` (3 skills). Spend this run: **$0.4514** of the $1.50 cap. The 03:00 daily task now runs the full sweep unauthenticated→via `gh` token, without LLM (no unattended spend); unlicensed repos stay rejected (130 rejections last run). Known gaps: flaky-network fetch failures self-heal on the next run; the public CI catalog grows on its next scheduled run.

**Slice 8 status (2026-10-06): done.** Nightly curator shipped: after the 03:00 sync, new/changed skills (contentHash delta, score-sorted) get one LLM review each — category + confidence + quality flags (`spam`, `low-effort`, `off-topic`, `duplicate-risk`, `broken`, `thin`) + one-line summary. Only **high-confidence corrections** are applied (ledgered with reasons); everything else lands in `curation.json` + `brief.md` and the dashboard's **Nightly brief** panel. Cache re-applies corrections on every sync so heuristic re-classification can't wipe them. Hard caps: 60 items + $0.25/night (`--curate-max-items/--curate-max-usd`), soft-fails like vectors. First pass (125 items, top-scored first): 55 corrections, 0 flags, **$0.0966**; catalog now 1,218 skills. Install-best-per-category shipped alongside (`install --best` + dashboard action) — 24 skills installed and active, one per category.

## Open items carried

- Final public repo name (working title only) + trademark glance before launch.
- License review for catalog redistribution (code MIT; catalog snapshots as release assets until cleared).
- Auto mode threshold tuning (Slice 2 design).
- Bulk-install UX details (Slice 4 with coverage profiles).
