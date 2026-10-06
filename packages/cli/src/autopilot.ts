import type { CatalogIndex } from "../../catalog/src/publish.ts"
import type { SkillRecord } from "../../catalog/src/types.ts"
import { activateSkill, deactivateSkill } from "./activate.ts"
import { applyUpdate, planUpdate } from "./commands/write.ts"
import { installSkill } from "./installer.ts"
import { readLockfile, upsertEntry, writeLockfile, type LockEntry, type Lockfile } from "./lockfile.ts"
import type { StoreLayout } from "./paths.ts"

const RISK_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }
const riskRank = (level: string): number => RISK_ORDER[level] ?? 9

export type AutopilotAction = {
  kind: "install" | "swap" | "update" | "deactivate" | "skip"
  category: string
  id: string
  score?: number
  replaced?: string
  reason?: string
}

export type AutopilotReport = {
  version: 1
  generatedAt: string
  perCategory: number
  margin: number
  dryRun: boolean
  actions: AutopilotAction[]
  installed: number
  active: number
  errors: number
}

type InstalledRef = { record: SkillRecord; entry: LockEntry }

/**
 * Keeps exactly `perCategory` best-scoring, gate-passed skills installed and active per category.
 * Rules: missing slots are filled; changed content updates in place; a challenger replaces the
 * weakest incumbent only when it beats it by `margin` points without a worse risk level; extras
 * beyond perCategory are deactivated (files stay in the store). Never deletes anything.
 */
export async function runAutopilot(opts: {
  l: StoreLayout
  index: CatalogIndex
  perCategory?: number
  margin?: number
  dryRun?: boolean
  activate?: boolean
  fetchImpl?: typeof fetch
  rawBase?: string
  now?: Date
}): Promise<AutopilotReport> {
  const perCategory = Math.max(1, Math.floor(opts.perCategory ?? 1))
  const margin = opts.margin ?? 3
  const dryRun = opts.dryRun ?? false
  const activate = opts.activate ?? true
  const now = opts.now ?? new Date()
  const actions: AutopilotAction[] = []
  let errors = 0
  let lock = readLockfile(opts.l.lockfilePath)

  const groups = new Map<string, { installed: InstalledRef[]; candidates: SkillRecord[] }>()
  for (const record of opts.index.skills) {
    if (record.status !== "candidate") continue
    const group = groups.get(record.category) ?? { installed: [], candidates: [] }
    const entry = lock.skills[record.id]
    if (entry) group.installed.push({ record, entry })
    else group.candidates.push(record)
    groups.set(record.category, group)
  }
  for (const group of groups.values()) {
    group.candidates.sort(
      (a, b) => b.scores.total - a.scores.total || riskRank(a.risk.level) - riskRank(b.risk.level) || a.id.localeCompare(b.id),
    )
  }

  const install = async (record: SkillRecord, kind: "install" | "swap", replaced?: string): Promise<boolean> => {
    if (dryRun) {
      actions.push({ kind, category: record.category, id: record.id, score: record.scores.total, ...(replaced ? { replaced } : {}) })
      return true
    }
    try {
      const entry = await installSkill({ record, l: opts.l, fetchImpl: opts.fetchImpl, rawBase: opts.rawBase, now })
      lock = upsertEntry(lock, entry)
      writeLockfile(opts.l.lockfilePath, lock)
      if (activate) {
        activateSkill(opts.l, record.id)
        lock = readLockfile(opts.l.lockfilePath)
      }
      actions.push({ kind, category: record.category, id: record.id, score: record.scores.total, ...(replaced ? { replaced } : {}) })
      return true
    } catch (error) {
      errors++
      actions.push({ kind: "skip", category: record.category, id: record.id, reason: `install failed: ${error instanceof Error ? error.message : String(error)}` })
      return false
    }
  }

  // 1. Refresh installed skills whose content changed upstream.
  for (const group of groups.values()) {
    for (const { record, entry } of group.installed) {
      if (entry.contentHash === record.contentHash) continue
      const plan = planUpdate(opts.l, opts.index, lock, record.id)
      if (plan.kind === "blocked") {
        actions.push({ kind: "skip", category: record.category, id: record.id, reason: "update blocked" })
        continue
      }
      if (plan.kind !== "update") continue
      if (dryRun) {
        actions.push({ kind: "update", category: record.category, id: record.id, score: record.scores.total })
        continue
      }
      try {
        await applyUpdate({ plan: plan.plan, l: opts.l, fetchImpl: opts.fetchImpl, rawBase: opts.rawBase, now })
        actions.push({ kind: "update", category: record.category, id: record.id, score: record.scores.total })
      } catch (error) {
        errors++
        actions.push({ kind: "skip", category: record.category, id: record.id, reason: `update failed: ${error instanceof Error ? error.message : String(error)}` })
      }
    }
  }
  if (!dryRun) lock = readLockfile(opts.l.lockfilePath)

  // 2. Fill missing slots.
  for (const group of groups.values()) {
    while (group.installed.length < perCategory && group.candidates.length > 0) {
      const record = group.candidates.shift()!
      if (await install(record, "install")) group.installed.push({ record, entry: lock.skills[record.id] ?? { id: record.id, contentHash: record.contentHash, provenanceTier: record.provenanceTier, installedAt: now.toISOString(), files: record.files, active: activate, riskLevel: record.risk.level, total: record.scores.total } })
    }
  }

  // 3. Swap the weakest incumbent when a challenger clearly beats it.
  for (const group of groups.values()) {
    while (group.candidates.length > 0) {
      let weakest = group.installed[0]!
      for (const ref of group.installed) if (ref.record.scores.total < weakest.record.scores.total) weakest = ref
      const challenger = group.candidates[0]!
      const clearlyBetter =
        challenger.scores.total > weakest.record.scores.total + margin &&
        riskRank(challenger.risk.level) <= riskRank(weakest.record.risk.level)
      if (!clearlyBetter) break
      group.candidates.shift()
      if (await install(challenger, "swap", weakest.record.id)) {
        group.installed = group.installed.filter((ref) => ref.record.id !== weakest.record.id)
        if (!dryRun && weakest.entry.active) {
          try {
            deactivateSkill(opts.l, weakest.record.id)
          } catch (error) {
            errors++
            actions.push({ kind: "skip", category: weakest.record.category, id: weakest.record.id, reason: `deactivate failed: ${error instanceof Error ? error.message : String(error)}` })
          }
        }
        group.installed.push({ record: challenger, entry: lock.skills[challenger.id] ?? weakest.entry })
      }
    }
  }

  // 4. Trim extras beyond perCategory (lowest-scoring first).
  for (const group of groups.values()) {
    if (group.installed.length <= perCategory) continue
    const ranked = [...group.installed].sort((a, b) => b.record.scores.total - a.record.scores.total || a.record.id.localeCompare(b.record.id))
    for (const extra of ranked.slice(perCategory)) {
      if (!extra.entry.active) continue
      actions.push({ kind: "deactivate", category: extra.record.category, id: extra.record.id, score: extra.record.scores.total, reason: "trimmed to per-category target" })
      if (!dryRun) {
        try {
          deactivateSkill(opts.l, extra.record.id)
        } catch (error) {
          errors++
          actions.push({ kind: "skip", category: extra.record.category, id: extra.record.id, reason: `deactivate failed: ${error instanceof Error ? error.message : String(error)}` })
        }
      }
    }
  }

  const final = dryRun ? lock : readLockfile(opts.l.lockfilePath)
  return {
    version: 1,
    generatedAt: now.toISOString(),
    perCategory,
    margin,
    dryRun,
    actions,
    installed: Object.keys(final.skills).length,
    active: Object.values(final.skills).filter((entry) => entry.active).length,
    errors,
  }
}
