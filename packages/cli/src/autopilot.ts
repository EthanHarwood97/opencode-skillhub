import type { CatalogIndex } from "../../catalog/src/publish.ts"
import type { SkillRecord } from "../../catalog/src/types.ts"
import { copySkillToManaged, removeSkillFromManaged } from "./activate.ts"
import { applyUpdate, planUpdate } from "./commands/write.ts"
import { installSkill } from "./installer.ts"
import { readLockfile, upsertEntry, writeLockfile, type LockEntry, type Lockfile } from "./lockfile.ts"
import type { StoreLayout } from "./paths.ts"

const RISK_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }
const riskRank = (level: string): number => RISK_ORDER[level] ?? 9

export type AutopilotAction = {
  kind: "install" | "swap" | "update" | "deactivate" | "activate" | "skip"
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

  // Lock state is owned by this function: filesystem helpers never touch the lockfile,
  // and every lock mutation is persisted immediately so phases cannot clobber each other.
  const persist = () => writeLockfile(opts.l.lockfilePath, lock)
  const setActiveFlag = (id: string, active: boolean): void => {
    const entry = lock.skills[id]
    if (entry) lock.skills[id] = { ...entry, active }
  }

  const install = async (record: SkillRecord, kind: "install" | "swap", replaced?: string): Promise<boolean> => {
    if (dryRun) {
      actions.push({ kind, category: record.category, id: record.id, score: record.scores.total, ...(replaced ? { replaced } : {}) })
      return true
    }
    try {
      const entry = await installSkill({ record, l: opts.l, fetchImpl: opts.fetchImpl, rawBase: opts.rawBase, now })
      lock = upsertEntry(lock, { ...entry, active: activate })
      persist()
      if (activate) copySkillToManaged(opts.l, record.id)
      actions.push({ kind, category: record.category, id: record.id, score: record.scores.total, ...(replaced ? { replaced } : {}) })
      return true
    } catch (error) {
      errors++
      actions.push({ kind: "skip", category: record.category, id: record.id, reason: `install failed: ${error instanceof Error ? error.message : String(error)}` })
      return false
    }
  }

  const deactivate = (record: SkillRecord, reason: string): void => {
    actions.push({ kind: "deactivate", category: record.category, id: record.id, score: record.scores.total, reason })
    if (dryRun) return
    try {
      removeSkillFromManaged(opts.l, record.id)
      setActiveFlag(record.id, false)
      persist()
    } catch (error) {
      errors++
      actions.push({ kind: "skip", category: record.category, id: record.id, reason: `deactivate failed: ${error instanceof Error ? error.message : String(error)}` })
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
        lock = readLockfile(opts.l.lockfilePath)
        actions.push({ kind: "update", category: record.category, id: record.id, score: record.scores.total })
      } catch (error) {
        errors++
        actions.push({ kind: "skip", category: record.category, id: record.id, reason: `update failed: ${error instanceof Error ? error.message : String(error)}` })
      }
    }
  }

  // 2. Trim extras beyond perCategory (keep the best-ranked, deactivate the rest) and make
  // sure the kept entries are actually active.
  for (const group of groups.values()) {
    if (group.installed.length <= perCategory) continue
    const ranked = [...group.installed].sort((a, b) => b.record.scores.total - a.record.scores.total || a.record.id.localeCompare(b.record.id))
    const extras = ranked.slice(perCategory)
    for (const extra of extras) deactivate(extra.record, "trimmed to per-category target")
    group.installed = ranked.slice(0, perCategory)
  }
  for (const group of groups.values()) {
    for (const ref of group.installed) {
      if (lock.skills[ref.record.id]?.active) continue
      actions.push({ kind: "activate", category: ref.record.category, id: ref.record.id, score: ref.record.scores.total, reason: "kept as category best" })
      if (!dryRun) {
        try {
          copySkillToManaged(opts.l, ref.record.id)
          setActiveFlag(ref.record.id, true)
          persist()
        } catch (error) {
          errors++
          actions.push({ kind: "skip", category: ref.record.category, id: ref.record.id, reason: `activate failed: ${error instanceof Error ? error.message : String(error)}` })
        }
      }
    }
  }

  // 3. Fill missing slots.
  for (const group of groups.values()) {
    while (group.installed.length < perCategory && group.candidates.length > 0) {
      const record = group.candidates.shift()!
      if (await install(record, "install")) {
        group.installed.push({ record, entry: lock.skills[record.id] ?? { id: record.id, contentHash: record.contentHash, provenanceTier: record.provenanceTier, installedAt: now.toISOString(), files: record.files, active: activate, riskLevel: record.risk.level, total: record.scores.total } })
      }
    }
  }

  // 4. Swap the weakest incumbent when a challenger clearly beats it.
  for (const group of groups.values()) {
    while (group.installed.length > 0 && group.candidates.length > 0) {
      let weakest = group.installed[0]!
      for (const ref of group.installed) if (ref.record.scores.total < weakest.record.scores.total) weakest = ref
      const challenger = group.candidates[0]!
      const clearlyBetter =
        challenger.scores.total > weakest.record.scores.total + margin &&
        riskRank(challenger.risk.level) <= riskRank(weakest.record.risk.level)
      if (!clearlyBetter) break
      group.candidates.shift()
      if (await install(challenger, "swap", weakest.record.id)) {
        deactivate(weakest.record, `swapped for ${challenger.id}`)
        group.installed = group.installed.filter((ref) => ref.record.id !== weakest.record.id)
        group.installed.push({ record: challenger, entry: lock.skills[challenger.id] ?? weakest.entry })
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
