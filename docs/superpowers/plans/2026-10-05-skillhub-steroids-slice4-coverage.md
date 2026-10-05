# SkillHub Steroids v1 — Slice 4: Coverage Map + Bulk Install

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Answer "what team of skills do I need?" — per-goal coverage percentages, honest gap lists, and an install action for a gap — all from the local index, no new artifacts.

**Architecture:** One pure catalog module (`coverage.ts`) owns the goal-profile table and the math (design of record: `docs/superpowers/specs/2026-10-05-skillhub-taxonomy-coverage-design.md`). Three consumers: the CLI (`skillhub coverage`), the dashboard Status page (read-only bars + gaps), and a bulk-install flow that loops the existing install route with explicit confirmation (no silent activation, no new server endpoints).

**Tech Stack:** existing catalog/cli/ui code; zero new deps; Node strip-only.

## Global Constraints

- Pure helper in `packages/catalog/src/` (no fs/network); consumers adapt.
- Strip-only; `.ts` relative imports; zero new deps; conventional commits; work in `.worktrees/steroids-slice4`.
- Existing suite (310/4) additive-green; `npm run typecheck` clean.
- Static export stays read-only: no install buttons in static mode.

---

### Task 1: `coverage.ts` (profiles + math, pure)

**Files:**
- Create: `packages/catalog/src/coverage.ts`
- Test: `packages/catalog/test/coverage.test.ts`

**Interfaces:**
- `type GoalProfile = { id: string; weights: Record<string, number>; bar: number; min: number }`
- `GOAL_PROFILES: GoalProfile[]` — exactly the five profiles/weights from the design doc (`coding`, `content`, `research`, `business-ops`, `design-creative`; bar 60, min 3).
- `type CategoryCoverage = { category: string; weight: number; supply: number; min: number; top: { id: string; name: string; total: number }[] }`
- `type ProfileCoverage = { profile: string; coverage: number; categories: CategoryCoverage[]; gaps: CategoryCoverage[] }` where `coverage` is an integer 0–100 (`Σ weight × min(1, supply/min) × 100`, rounded).
- `computeCoverage(records: SkillRecord[], profileId: string, opts?: { bar?: number; min?: number }): ProfileCoverage` — throws `Error("unknown profile: <id>")` for an unknown id; supply counts `status === "candidate"` records in the category with `scores.total >= bar`; `top` = best 3 candidates in the category by total (regardless of bar), deterministic tie by id; `gaps` = categories with `supply < min`, in weight-desc order.

- [ ] **Step 1: Write the failing tests** — cover: the five profiles exist with weights summing to 1 (±1e-9) and all weights reference known categories; a category with `supply >= min` contributes full weight; below-min scales and appears in `gaps`; unknown profile throws; top-3 ordering/determinism; bar override changes supply; a fully-covered profile reports 100 and no gaps.

```ts
import { describe, expect, it } from "vitest"
import { computeCoverage, GOAL_PROFILES } from "../src/coverage.ts"
import { makeRecord } from "./helpers.ts"

const rec = (id: string, category: string, total: number, status = "candidate") =>
  makeRecord({ id, category, status, scores: { ...makeRecord({ id }).scores, total } })

describe("GOAL_PROFILES", () => {
  it("weights sum to 1 and reference real categories", () => {
    for (const profile of GOAL_PROFILES) {
      const sum = Object.values(profile.weights).reduce((n, w) => n + w, 0)
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
      for (const category of Object.keys(profile.weights)) expect(typeof category).toBe("string")
    }
    expect(GOAL_PROFILES.map((p) => p.id)).toEqual(["coding", "content", "research", "business-ops", "design-creative"])
  })
})

describe("computeCoverage", () => {
  it("scores full weight when a category meets its minimum", () => {
    const records = ["a/1", "a/2", "a/3"].map((id, i) => rec(id, "engineering", 70 + i))
    const result = computeCoverage(records, "coding")
    expect(result.gaps.every((gap) => gap.category !== "engineering")).toBe(true)
    expect(result.categories.find((c) => c.category === "engineering")!.supply).toBe(3)
  })

  it("scales partial supply, reports gaps in weight order, and lists tops below the bar", () => {
    const records = [rec("a/1", "engineering", 65), rec("a/2", "testing", 40), rec("a/2b", "testing", 55)]
    const result = computeCoverage(records, "coding")
    const testing = result.categories.find((c) => c.category === "testing")!
    expect(testing.supply).toBe(0)
    expect(testing.top.map((t) => t.id)).toEqual(["a/2b", "a/2"])
    expect(result.gaps.map((g) => g.category)).toContain("testing")
    expect(result.coverage).toBeGreaterThan(0)
    expect(result.coverage).toBeLessThan(100)
  })

  it("throws for an unknown profile and supports bar/min overrides", () => {
    expect(() => computeCoverage([], "nope")).toThrow(/unknown profile/)
    const records = [rec("a/1", "engineering", 50)]
    expect(computeCoverage(records, "coding", { bar: 50, min: 1 }).coverage).toBe(100)
  })
})
```

- [ ] **Step 2: Implement `coverage.ts`** — profile table verbatim from the design doc; loop categories in weight-desc order; `top` sorted `total desc, id asc`, sliced 3; integer coverage via `Math.round`.

- [ ] **Step 3: Verify + commit** — `npx vitest run packages/catalog/test/coverage.test.ts && npm run typecheck`; `feat(catalog): goal profiles and coverage math`.

---

### Task 2: `skillhub coverage` CLI

**Files:**
- Create: `packages/cli/src/commands/coverage.ts`
- Modify: `packages/cli/src/bin.ts` (add the command)
- Test: `packages/cli/test/coverage-command.test.ts`

**Interfaces:**
- `runCoverage(l: StoreLayout, profileId?: string): ProfileCoverage[]` — reads the store index via `readCatalog`; unknown profile throws from the helper.
- `formatCoverage(results: ProfileCoverage[]): string` — one line per profile: `<id> <pct>% — gaps: <category> (<supply>/<min>), …` or `<id> 100% — no gaps`.
- CLI: `skillhub coverage [--profile <id>] [--json]` — default lists all five; `--profile` prints the full category table (category, weight, supply/min, top ids); `--json` prints raw.

- [ ] **Step 1: Write the failing test** — build a tmp store index with a known mix (e.g. 3 engineering, 0 testing records), call `runCoverage(l)` → coding present with a testing gap; `formatCoverage` contains `coding` and `testing (0/3)`; `runCoverage(l, "nope")` throws.
- [ ] **Step 2: Implement** — follow the existing `commands/depth.ts` command style; wire into `bin.ts` with the same option formatting as `trending`.
- [ ] **Step 3: Verify + commit** — `npx vitest run packages/cli/test/coverage-command.test.ts && npm run typecheck`; `feat(cli): skillhub coverage command`.

---

### Task 3: Dashboard — coverage DTO + Status section (read-only)

**Files:**
- Modify: `packages/ui/src/lib/contract.ts` (`StatusDto` gains `coverage: ProfileCoverageDto[]`; new `ProfileCoverageDto`/`CoverageCategoryDto` with `top: { id; name; total }[]`)
- Modify: `packages/cli/src/ui/data.ts` (`buildStatus` computes `GOAL_PROFILES.map((p) => toDto(computeCoverage(snapshot.index.skills, p.id)))`)
- Modify: `packages/ui/src/pages/OverviewPage.tsx` + `OverviewPage.module.css` (a "Coverage" panel: per-profile row with a meter/percentage and gap chips listing `category (supply/min)`; each gap link goes to `/gallery?category=<category>`)
- Tests: `packages/cli/test/ui-data.test.ts` (DTO mapping incl. an empty-index case → all profiles 0%), `packages/ui/test/overview.test.tsx` (panel renders profile + gap text)

**Copy pinned:** panel heading `Coverage`; hint `What each goal profile needs, measured against the catalog.`; gap chip text `<category> <supply>/<min>`; empty-index note `No skills yet — run a sync to populate the catalog.`

- [ ] **Step 1: Tests first** (MSW status payload gains `coverage`; data test asserts DTO).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Verify + commit** — `npx vitest run packages/cli/test/ui-data.test.ts packages/ui/test/overview.test.tsx && npm run typecheck`; `feat(ui): coverage panel on the status page`.

---

### Task 4: Bulk install from a gap + acceptance

**Files:**
- Modify: `packages/ui/src/pages/OverviewPage.tsx` (per gap: a `Review for install` action opening the existing `Modal` listing the gap's `top` skills with checkboxes (default: all top candidates not installed), a `Verify and install` confirm that sequentially calls `installSkillAction(id, false)` for each checked id, toasts per result, and invalidates `["status"]`/`["skills"]` after)
- Reuse `Modal`, `Button`, `Chip`, `useToast`, `isLive` (gaps render links only in static mode — no install buttons)
- Tests: `packages/ui/test/overview.test.tsx` (MSW POST /api/skills/:id/install handler with a call counter; open modal, confirm, assert sequential calls for the checked ids and a success toast; static mode → no install button)

**Behavior constraints:** no dry-run double call in bulk (the install route hash-verifies during install); one confirmation for the batch; per-skill error toasts don't abort the rest; nothing activates.

- [ ] **Step 1: Tests first.**
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Full gate + real-store acceptance** — `npm test` (expect 310/4 + new) and `npm run typecheck`; then a read-only real-store check: `computeCoverage` over the real 59-skill index prints per-profile coverage + at least one honest gap (record the numbers). Update the roadmap: Slice 4 → `**Done 2026-10-05**` with the observed numbers; commit `feat(ui): bulk install from coverage gaps; slice 4 acceptance`.
