import type { CatalogIndex } from "../../../catalog/src/publish.ts"
import type { InstallBestResultDto, InstallResultDto, UpdateReviewDto } from "../../../ui/src/lib/contract.ts"
import { activateSkill, deactivateSkill } from "../activate.ts"
import { applyUpdate, findingRules, planUpdate, reviewSkill } from "../commands/write.ts"
import { HashMismatchError, installSkill, MissingSourceError } from "../installer.ts"
import { readLockfile, upsertEntry, writeLockfile } from "../lockfile.ts"
import { pickBestPerCategory } from "../pick.ts"
import type { StoreLayout } from "../paths.ts"

export type EngineContext = {
  l: StoreLayout
  index: CatalogIndex
  fetchImpl?: typeof fetch
  rawBase?: string
  now?: () => Date
}

export class UiActionError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const engineError = (error: unknown): never => {
  if (error instanceof MissingSourceError || error instanceof HashMismatchError) {
    throw new UiActionError(error.message, 409, "engine")
  }
  throw error
}

export async function handleInstall(ctx: EngineContext, id: string, dryRun: boolean): Promise<InstallResultDto> {
  const record = ctx.index.skills.find((skill) => skill.id === id)
  if (!record) throw new UiActionError(`no skill with id ${id}`, 404, "not_found")
  if (record.status !== "candidate") throw new UiActionError(`refusing to install ${record.status} skill: ${id}`, 409, "engine")
  try {
    const entry = await installSkill({ record, l: ctx.l, fetchImpl: ctx.fetchImpl, rawBase: ctx.rawBase, dryRun, now: ctx.now?.() })
    if (!dryRun) writeLockfile(ctx.l.lockfilePath, upsertEntry(readLockfile(ctx.l.lockfilePath), entry))
    return {
      status: dryRun ? "verified" : "installed",
      entry: { id: entry.id, contentHash: entry.contentHash, provenanceTier: entry.provenanceTier, riskLevel: entry.riskLevel, total: entry.total },
    }
  } catch (error) {
    return engineError(error)
  }
}

/** Install (and optionally activate) the best candidate per category, topping each up to `perCategory`. */
export async function handleInstallBest(
  ctx: EngineContext,
  opts: { perCategory: number; dryRun: boolean; activate: boolean },
): Promise<InstallBestResultDto> {
  const lock = readLockfile(ctx.l.lockfilePath)
  const { perCategory, picks, covered } = pickBestPerCategory(ctx.index, lock, { perCategory: opts.perCategory })
  const results: InstallBestResultDto["picks"] = []
  let failed = 0
  for (const pick of picks) {
    if (opts.dryRun) {
      results.push({ ...pick, outcome: "planned" })
      continue
    }
    const record = ctx.index.skills.find((skill) => skill.id === pick.id)
    if (!record || record.status !== "candidate") {
      failed += 1
      results.push({ ...pick, outcome: "failed", error: `no installable record for ${pick.id}` })
      continue
    }
    try {
      const entry = await installSkill({ record, l: ctx.l, fetchImpl: ctx.fetchImpl, rawBase: ctx.rawBase, now: ctx.now?.() })
      writeLockfile(ctx.l.lockfilePath, upsertEntry(readLockfile(ctx.l.lockfilePath), entry))
      if (opts.activate) {
        activateSkill(ctx.l, pick.id)
        results.push({ ...pick, outcome: "activated" })
      } else {
        results.push({ ...pick, outcome: "installed" })
      }
    } catch (error) {
      failed += 1
      results.push({ ...pick, outcome: "failed", error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { perCategory, picks: results, covered: covered.map((entry) => entry.category), failed }
}

export function handleActivate(ctx: EngineContext, id: string, active: boolean): { status: "active" | "inactive" } {
  try {
    if (active) activateSkill(ctx.l, id)
    else deactivateSkill(ctx.l, id)
    return { status: active ? "active" : "inactive" }
  } catch (error) {
    throw new UiActionError(error instanceof Error ? error.message : String(error), 409, "engine")
  }
}

export async function handleUpdateReview(ctx: EngineContext, id: string): Promise<UpdateReviewDto> {
  const result = planUpdate(ctx.l, ctx.index, readLockfile(ctx.l.lockfilePath), id)
  if (result.kind === "not-installed") throw new UiActionError(`not installed: ${id}`, 404, "not_found")
  if (result.kind === "up-to-date") return { kind: "up-to-date" }
  if (result.kind === "blocked") return { kind: "blocked", blockedFindings: findingRules(result.record) }
  try {
    const reviewed = await reviewSkill({ plan: result.plan, l: ctx.l, fetchImpl: ctx.fetchImpl, rawBase: ctx.rawBase })
    return {
      kind: "update",
      changes: reviewed.changes.map((change) => ({ path: change.path, status: change.status, ...(change.patch ? { patch: change.patch } : {}) })),
      riskDelta: result.plan.riskDelta,
      scoreDelta: result.plan.scoreDelta,
    }
  } catch (error) {
    return engineError(error)
  }
}

export async function handleUpdateApply(ctx: EngineContext, id: string, confirm: unknown): Promise<InstallResultDto["entry"]> {
  if (confirm !== true) throw new UiActionError("applying an update requires confirm: true", 400, "invalid")
  const result = planUpdate(ctx.l, ctx.index, readLockfile(ctx.l.lockfilePath), id)
  if (result.kind === "not-installed") throw new UiActionError(`not installed: ${id}`, 404, "not_found")
  if (result.kind === "up-to-date") throw new UiActionError(`${id} is already up to date`, 409, "engine")
  if (result.kind === "blocked") throw new UiActionError(`update blocked (${findingRules(result.record).join(", ") || "status " + result.record.status})`, 409, "engine")
  try {
    const entry = await applyUpdate({ plan: result.plan, l: ctx.l, fetchImpl: ctx.fetchImpl, rawBase: ctx.rawBase, now: ctx.now?.() })
    return { id: entry.id, contentHash: entry.contentHash, provenanceTier: entry.provenanceTier, riskLevel: entry.riskLevel, total: entry.total }
  } catch (error) {
    return engineError(error)
  }
}
