# SkillHub Steroids v1 — Slice 3: Upgrade Suggestions + Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When a better-ranked skill exists for something you actively use, you hear about it — a session-start toast and a Review-queue entry — without anything swapping silently.

**Architecture:** One pure catalog helper computes suggestions from the index + lockfile (`computeUpgradeSuggestions`). Two consumers: the plugin status/notifier (`/skills` line + startup toast) and the dashboard review DTO/page. No new artifacts, no sync changes, no network.

**Design decisions (locked):**
- Suggestion = an **active** installed skill whose index record has a same-cluster `candidate` outscoring its installed total by a margin (`+5`), best-first, capped at 3.
- No automatic replacement; suggestions are links/actions only.
- Copy pinned: toast `SkillHub: N of your active skills have a better-ranked alternative — run /skills`; status line `upgrade suggestions: <from> → <to> (+N) …` / `none`; dashboard empty hint `Every active skill is the best in its group.`

**Tech Stack:** existing catalog/plugin/UI code; zero new deps; Node strip-only.

## Global Constraints

- Pure helper in `packages/catalog/src/` (no fs/network); consumers adapt their own data.
- Strip-only, `.ts` relative imports, zero new deps, conventional commits, work in `.worktrees/steroids-slice3`.
- Existing suites (298/4) stay additive-green; `npm run typecheck` clean.

---

### Task 1: `computeUpgradeSuggestions` (catalog, pure)

**Files:**
- Create: `packages/catalog/src/upgrades.ts`
- Test: `packages/catalog/test/upgrades.test.ts`

**Interfaces:**
- `type InstalledEntry = { id: string; total: number; active: boolean }`
- `type UpgradeSuggestion = { from: string; to: string; fromTotal: number; toTotal: number; clusterId: string }`
- `computeUpgradeSuggestions(records: SkillRecord[], installed: InstalledEntry[], opts?: { margin?: number; limit?: number }): UpgradeSuggestion[]`

- [ ] **Step 1: Write the failing tests**

`packages/catalog/test/upgrades.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { computeUpgradeSuggestions } from "../src/upgrades.ts"
import { makeRecord } from "./helpers.ts"

const rec = (id: string, over: Partial<Parameters<typeof makeRecord>[0]> = {}) =>
  makeRecord({ id, clusterId: "c-1", status: "candidate", scores: { ...makeRecord({ id }).scores, total: 60 }, ...over })

describe("computeUpgradeSuggestions", () => {
  it("suggests a better same-cluster candidate for an active skill", () => {
    const records = [rec("a/old", { scores: { ...rec("a/old").scores, total: 60 } }), rec("a/new", { scores: { ...rec("a/new").scores, total: 78 } })]
    const out = computeUpgradeSuggestions(records, [{ id: "a/old", total: 55, active: true }])
    expect(out).toEqual([{ from: "a/old", to: "a/new", fromTotal: 55, toTotal: 78, clusterId: "c-1" }])
  })

  it("respects the margin, quarantine, and different clusters", () => {
    const records = [
      rec("a/old"),
      rec("a/thin", { scores: { ...rec("a/thin").scores, total: 59 } }), // below 55 + 5
      rec("a/quarantined", { status: "quarantined", scores: { ...rec("a/quarantined").scores, total: 90 } }),
      rec("a/other-cluster", { clusterId: "c-2", scores: { ...rec("a/other-cluster").scores, total: 90 } }),
    ]
    expect(computeUpgradeSuggestions(records, [{ id: "a/old", total: 55, active: true }])).toEqual([])
  })

  it("ignores inactive installs and missing records, dedupes to the best target, sorts and caps", () => {
    const records = [
      rec("a/old", { scores: { ...rec("a/old").scores, total: 60 } }),
      rec("a/mid", { scores: { ...rec("a/mid").scores, total: 70 } }),
      rec("a/best", { scores: { ...rec("a/best").scores, total: 90 } }),
    ]
    const out = computeUpgradeSuggestions(records, [{ id: "a/old", total: 50, active: true }], { limit: 5 })
    expect(out.map((s) => s.to)).toEqual(["a/best"])
    expect(computeUpgradeSuggestions(records, [{ id: "a/old", total: 50, active: false }])).toEqual([])
    expect(computeUpgradeSuggestions(records, [{ id: "a/ghost", total: 50, active: true }])).toEqual([])
  })

  it("is deterministic on ties and applies the default limit of 3", () => {
    const records = [rec("a/old"), rec("a/b"), rec("a/a"), rec("a/c"), rec("a/d")].map((r) => ({ ...r, scores: { ...r.scores, total: 90 } }))
    const installed = [
      { id: "a/old", total: 50, active: true },
      { id: "a/old2", total: 50, active: true },
      { id: "a/old3", total: 50, active: true },
      { id: "a/old4", total: 50, active: true },
    ]
    const rows = records.concat([rec("a/old2"), rec("a/old3"), rec("a/old4")])
    const out = computeUpgradeSuggestions(rows, installed, { margin: 1 })
    expect(out).toHaveLength(3)
    for (const suggestion of out) expect(suggestion.to).toBe("a/a")
  })
})
```

- [ ] **Step 2: Run, confirm failure.**

- [ ] **Step 3: Implement `upgrades.ts`**

```ts
import type { SkillRecord } from "./types.ts"

export type InstalledEntry = { id: string; total: number; active: boolean }

export type UpgradeSuggestion = {
  from: string
  to: string
  fromTotal: number
  toTotal: number
  clusterId: string
}

/** Active skills that a better-ranked same-cluster candidate outranks by `margin`. */
export function computeUpgradeSuggestions(
  records: SkillRecord[],
  installed: InstalledEntry[],
  opts: { margin?: number; limit?: number } = {},
): UpgradeSuggestion[] {
  const margin = opts.margin ?? 5
  const limit = opts.limit ?? 3
  const byId = new Map(records.map((record) => [record.id, record]))
  const suggestions: UpgradeSuggestion[] = []
  for (const entry of installed) {
    if (!entry.active) continue
    const current = byId.get(entry.id)
    if (!current) continue
    let best: SkillRecord | undefined
    for (const record of records) {
      if (record.status !== "candidate" || record.clusterId !== current.clusterId || record.id === current.id) continue
      if (record.scores.total < entry.total + margin) continue
      if (!best || record.scores.total > best.scores.total || (record.scores.total === best.scores.total && record.id.localeCompare(best.id) < 0)) {
        best = record
      }
    }
    if (best) suggestions.push({ from: entry.id, to: best.id, fromTotal: entry.total, toTotal: best.scores.total, clusterId: current.clusterId })
  }
  return suggestions.sort((a, b) => b.toTotal - a.toTotal || a.from.localeCompare(b.from)).slice(0, limit)
}
```

- [ ] **Step 4: Verify + commit.** `npx vitest run packages/catalog/test/upgrades.test.ts && npm run typecheck`; `feat(catalog): upgrade suggestions for active skills`.

---

### Task 2: Status line + startup toast (plugin)

**Files:**
- Modify: `packages/plugin/src/status-core.ts` (StatusInput gains `upgrades`; render line; notifier toast)
- Modify: `packages/plugin/src/wiring.ts` (`collectStatus` computes upgrades)
- Test: `packages/plugin/test/status.test.ts` (render + notifier cases); `packages/plugin/test/wiring.test.ts` (one fixture-based collectStatus case)

**Interfaces:**
- `StatusInput` gains `upgrades: UpgradeSuggestion[]` (type import from `../../catalog/src/upgrades.ts`).
- `renderStatus` appends: `  upgrade suggestions: ${upgrades.length ? upgrades.map((u) => `${u.from} → ${u.to} (+${Math.round(u.toTotal - u.fromTotal)})`).join(", ") : "none"}`.
- `makeStartupNotifier` toasts once more when `upgrades.length > 0`: `SkillHub: ${n} of your active skills have a better-ranked alternative — run /skills` (variant `info`).
- `collectStatus` builds `InstalledEntry[]` from `Object.entries(lock.skills).map(([id, e]) => ({ id, total: e.total, active: e.active }))` and `computeUpgradeSuggestions(index?.skills ?? [], installed)`.

- [ ] **Step 1: Extend tests (failing first):** in `status.test.ts`, update every `StatusInput` fixture with `upgrades: []` (plus one render case asserting the `a/x → a/y (+8)` line and one notifier case asserting the new toast fires once); in `wiring.test.ts`, add a fixture-store case: index with two same-cluster candidates (`old` active total 50, `new` total 70) + lockfile with `old` active → `collectStatus(...).upgrades` has length 1 with `to: "new-id"`.
- [ ] **Step 2: Implement the three files.**
- [ ] **Step 3: Verify + commit.** `npx vitest run packages/plugin/test && npm run typecheck`; `feat(plugin): upgrade suggestions in status and startup toast`.

---

### Task 3: Review-queue section + docs

**Files:**
- Modify: `packages/ui/src/lib/contract.ts` (ReviewDto gains `upgrades: { from; to; fromTotal; toTotal }[]`)
- Modify: `packages/cli/src/ui/data.ts` (`buildReview` computes upgrades via the helper)
- Modify: `packages/ui/src/pages/ReviewPage.tsx` (new section) + `ReviewPage.module.css` if needed
- Tests: `packages/cli/test/ui-data.test.ts`, `packages/ui/test/review.test.tsx`, `packages/ui/test/fixtures.ts` if the shared card fixture needs nothing new (upgrades are id-level, not cards)
- Docs: `docs/superpowers/plans/2026-10-05-skillhub-steroids-v1-roadmap.md` Slice 3 status; README one bullet under "The dashboard" review description.

**Interfaces:**
- `buildReview`: `upgrades: computeUpgradeSuggestions(snapshot.index.skills, Object.entries(snapshot.lock.skills).map(([id, e]) => ({ id, total: e.total, active: e.active }))).map(({ from, to, fromTotal, toTotal }) => ({ from, to, fromTotal, toTotal }))`.
- ReviewPage section (between "New this week" and "Updates available"):
  - heading `Upgrade suggestions`
  - rows: `${from} → ${to}` link-style, delta chip `+N`, hint `Review the alternative in the gallery before switching.`
  - empty hint exactly: `Every active skill is the best in its group.`

- [ ] **Step 1: Extend tests first** (data test asserts upgrades array from a fixture snapshot; review page test asserts the section and the empty hint; keep MSW handlers current).
- [ ] **Step 2: Implement contract/data/page.**
- [ ] **Step 3: Verify + commit.** `npx vitest run packages/cli/test/ui-data.test.ts packages/ui/test/review.test.tsx packages/ui/test/gallery.test.tsx && npm run typecheck`; `feat(ui): upgrade suggestions in the review queue`.

---

### Task 4: Acceptance

- [ ] `npm test` (expect 298/4 + new) and `npm run typecheck` clean in the worktree.
- [ ] Real-store spot check (read-only harness, no commit): with the current store (active `understand-diff`, 59 skills), call `computeUpgradeSuggestions` on the real index+lockfile and print the result — expect an empty list unless a same-cluster skill outranks it; record the output.
- [ ] After merge + restart, `/skills` shows the `upgrade suggestions:` line and the toast fires only when something genuinely outranks an active skill.
- [ ] Roadmap Slice 3 marked done with the real-store observation.
