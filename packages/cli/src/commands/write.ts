import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import type { CatalogIndex } from "../../../catalog/src/publish.ts"
import type { SkillRecord } from "../../../catalog/src/types.ts"
import { diffFiles, readStoreFiles, type FileChange } from "../diff.ts"
import { fetchRecordFiles, verifyFiles, MissingSourceError } from "../installer.ts"
import { readLockfile, upsertEntry, writeLockfile, type LockEntry, type Lockfile } from "../lockfile.ts"
import type { StoreLayout } from "../paths.ts"

export type UpdatePlan = {
  id: string
  from: LockEntry
  to: SkillRecord
  changes: ReturnType<typeof diffFiles>
  riskDelta: { from: string; to: string }
  scoreDelta: { from: number; to: number }
}

export function planUpdate(l: StoreLayout, index: CatalogIndex, lock: Lockfile, id: string): UpdatePlan | undefined {
  const from = lock.skills[id]
  const to = index.skills.find((s) => s.id === id)
  if (!from || !to || from.contentHash === to.contentHash) return undefined

  const oldByPath = new Map(from.files.map((f) => [f.path, f.sha256]))
  const newByPath = new Map(to.files.map((f) => [f.path, f.sha256]))
  const changes = [...new Set([...oldByPath.keys(), ...newByPath.keys()])]
    .sort()
    .flatMap((path): FileChange[] => {
      const before = oldByPath.get(path)
      const after = newByPath.get(path)
      if (before && !after) return [{ path, status: "removed" }]
      if (!before && after) return [{ path, status: "added" }]
      if (before !== after) return [{ path, status: "modified" }]
      return []
    })

  return {
    id,
    from,
    to,
    changes,
    riskDelta: { from: from.riskLevel, to: to.risk.level },
    scoreDelta: { from: from.total, to: to.scores.total },
  }
}

export async function reviewSkill(opts: {
  plan: UpdatePlan
  l: StoreLayout
  fetchImpl?: typeof fetch
  rawBase?: string
}): Promise<{ changes: FileChange[]; newFiles: { path: string; bytes: Uint8Array }[] }> {
  const fetched = await fetchRecordFiles(opts.plan.to, { fetchImpl: opts.fetchImpl, rawBase: opts.rawBase })
  const newFiles = [...fetched.entries()].map(([path, bytes]) => ({ path, bytes }))
  return { changes: diffFiles(readStoreFiles(opts.l, opts.plan.id), newFiles), newFiles }
}

export async function applyUpdate(opts: {
  plan: UpdatePlan
  l: StoreLayout
  fetchImpl?: typeof fetch
  rawBase?: string
  now?: Date
}): Promise<LockEntry> {
  const fetched = await fetchRecordFiles(opts.plan.to, { fetchImpl: opts.fetchImpl, rawBase: opts.rawBase })
  verifyFiles(opts.plan.to, fetched)

  const target = join(opts.l.storeDir, opts.plan.id)
  const resolvedTarget = resolve(target)
  const toPaths = new Set(opts.plan.to.files.map((f) => f.path))
  const removed = opts.plan.from.files.map((f) => f.path).filter((path) => !toPaths.has(path))
  for (const path of [...fetched.keys(), ...removed]) {
    const dest = resolve(resolvedTarget, path)
    if (dest !== resolvedTarget && !dest.startsWith(resolvedTarget + sep)) {
      throw new MissingSourceError(`unsafe file path (escapes store): ${path}`)
    }
  }

  for (const path of removed) rmSync(join(opts.l.storeDir, opts.plan.id, path), { force: true })

  for (const [path, bytes] of fetched) {
    const dest = join(opts.l.storeDir, opts.plan.id, path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, bytes)
  }

  const entry: LockEntry = {
    id: opts.plan.id,
    ref: opts.plan.to.source.ref,
    contentHash: opts.plan.to.contentHash,
    provenanceTier: opts.plan.to.provenanceTier,
    installedAt: (opts.now ?? new Date()).toISOString(),
    files: opts.plan.to.files,
    active: opts.plan.from.active,
    riskLevel: opts.plan.to.risk.level,
    total: opts.plan.to.scores.total,
  }
  writeLockfile(opts.l.lockfilePath, upsertEntry(readLockfile(opts.l.lockfilePath), entry))
  return entry
}
