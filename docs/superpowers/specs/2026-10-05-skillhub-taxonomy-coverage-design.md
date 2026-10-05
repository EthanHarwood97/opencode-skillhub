# SkillHub — Taxonomy & Coverage Design (Slice 0)

Date: 2026-10-05. Status: design of record for Slice 4. Authority: user direction ("10s or even 100s of categories from UI, Art, Finance, Business"; coverage must answer "what team of skills covers everything").

## Decision: two levels, one demand layer

1. **Coarse categories stay fixed (12).** They are the supply skeleton and already drive scoring, filters, and the gallery: engineering, testing, design-ui, writing, data, research, marketing-growth, business-finance, docs-productivity, security, media-creative, infrastructure-devops. Do not add a category per niche — that path ends in a taxonomy nobody maintains.
2. **Fine structure is emergent.** Clusters (k-means over skill text, currently ~sqrt(n) groups) already do the long tail; 100s of coherent groups appear naturally from the data, labelled by their top terms. Categories = navigation; clusters = precision.
3. **The missing layer is demand.** "Do we have the skills we need?" needs goals, not labels. Goal **profiles** define what a user wants to be able to do; coverage measures supply against each profile.

## Goal profiles (v1)

Each profile = weighted categories + a quality bar + a minimum viable count per category.

| Profile | Category weights (must sum to 1) | Bar | Min |
|---|---|---|---|
| `coding` | engineering .30 · testing .15 · infrastructure-devops .15 · security .10 · docs-productivity .10 · data .10 · research .10 | 60 | 3 |
| `content` | writing .35 · marketing-growth .25 · design-ui .15 · media-creative .15 · research .10 | 60 | 3 |
| `research` | research .40 · data .25 · writing .15 · docs-productivity .10 · engineering .10 | 60 | 3 |
| `business-ops` | business-finance .45 · marketing-growth .20 · docs-productivity .15 · data .10 · writing .10 | 60 | 3 |
| `design-creative` | design-ui .45 · media-creative .25 · writing .15 · engineering .15 | 60 | 3 |

Deliberately five profiles, not fifty: the set answers "am I tooled for this kind of work?" without becoming a second ranking system. Profiles are data (a table in code), so adding one later is a one-line change.

## Coverage computation

Pure function over the catalog index (no new artifacts; recomputed per request):

```
supply(profile, category) = count of candidate skills in category with scores.total >= bar
coverage(profile)         = Σ weight × min(1, supply / min)
gaps(profile)             = categories where supply < min, each with the top available
                            skills below/above the bar so the user can act
```

- `coverage` is 0–100%. 100% means "every weighted category has at least `min` skills above the bar" — deliberately modest thresholds; quality beyond that is the ranker's job.
- Gaps report the best existing skills in the weak category, plus "install selected" actions.
- **Usage weighting is a later enhancement** (Slice 3 telemetry feeds it); v1 weights are the profile table, so coverage is explainable.

## Bulk install by profile

The gallery gets multi-select; the coverage view gets one action per gap: "install the top N missing skills for this profile". Install semantics are unchanged (dry-run verify → confirm → pinned copy); bulk only loops the existing engine with per-skill results, skipping already-installed ids. No silent activation — installing is not activating.

## Naming check (recorded here for the public release)

- Repo/brand: **"Opencode on Steroids"** as the tagline; technical identity `opencode-skillhub` (plugin package name and planned repo name). Trademark glance: descriptive use of "opencode" in a companion tool name is conventional; do not present it as an official opencode product (README states it is independent).
- Final availability check happens at Slice 5 (GitHub owner: EthanHarwood97).

## Slice 4 build checklist

- `packages/catalog/src/coverage.ts`: profile table + `computeCoverage(records, profileId)` + `computeGaps(...)` with tests.
- `packages/cli/src/ui/data.ts`: coverage DTO per profile from the index.
- Dashboard: a "Coverage" section on the Status page (per-profile bars, gap lists) + bulk-install button per gap wired to the existing install route (sequential, per-skill results, confirmation dialog).
- `skillhub coverage [--profile <id>]` CLI printing the same numbers.
- Tests: pure coverage math; DTO mapping; UI renders gaps; bulk install server-side loop with fake fetch (offline).
- Acceptance: with the real 59-skill store, at least one honest gap is surfaced and installable; no silent swaps.
