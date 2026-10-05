import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { unzipSync } from "fflate"
import { sha256 } from "../../catalog/src/parse.ts"
import type { SkillRecord } from "../../catalog/src/types.ts"
import type { LockEntry } from "./lockfile.ts"
import type { StoreLayout } from "./paths.ts"

export class HashMismatchError extends Error {}
export class MissingSourceError extends Error {}

export type FetchedFiles = Map<string, Uint8Array>

export async function fetchRecordFiles(
  record: SkillRecord,
  opts: { fetchImpl?: typeof fetch; rawBase?: string } = {},
): Promise<FetchedFiles> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const files: FetchedFiles = new Map()

  if (record.source.kind === "github") {
    if (!record.source.repo || !record.source.ref) throw new MissingSourceError(`github record ${record.id} lacks repo/ref`)
    const rawBase = opts.rawBase ?? "https://raw.githubusercontent.com"
    for (const file of record.files) {
      const res = await fetchImpl(`${rawBase}/${record.source.repo}/${record.source.ref}/${file.path}`)
      if (!res.ok) throw new MissingSourceError(`fetch failed (${res.status}): ${file.path}`)
      files.set(file.path, new Uint8Array(await res.arrayBuffer()))
    }
    return files
  }

  if (record.source.kind === "marketplace") {
    if (!record.source.url) throw new MissingSourceError(`marketplace record ${record.id} lacks url`)
    const res = await fetchImpl(record.source.url)
    if (!res.ok) throw new MissingSourceError(`zip fetch failed (${res.status})`)
    const zip = unzipSync(new Uint8Array(await res.arrayBuffer()))
    for (const file of record.files) {
      const key = Object.keys(zip).find((k) => k === file.path || k.endsWith(`/${file.path}`) || k.endsWith(`/${file.path.split("/").at(-1)}`))
      if (!key || !zip[key]) throw new MissingSourceError(`file not found in zip: ${file.path}`)
      files.set(file.path, zip[key] as Uint8Array)
    }
    return files
  }

  throw new MissingSourceError(`local records are ingest-only; adoption lands in Phase 2 (${record.id})`)
}

export function verifyFiles(record: SkillRecord, files: FetchedFiles): void {
  for (const file of record.files) {
    const bytes = files.get(file.path)
    if (!bytes) throw new MissingSourceError(`missing fetched file ${file.path}`)
    if (bytes.byteLength !== file.size) throw new HashMismatchError(`hash mismatch (size) for ${file.path}`)
    if (sha256(bytes) !== file.sha256) throw new HashMismatchError(`hash mismatch (sha256) for ${file.path}`)
  }
}

export async function installSkill(opts: {
  record: SkillRecord
  l: StoreLayout
  fetchImpl?: typeof fetch
  rawBase?: string
  dryRun?: boolean
  now?: Date
}): Promise<LockEntry> {
  const { record, l } = opts
  const files = await fetchRecordFiles(record, { fetchImpl: opts.fetchImpl, rawBase: opts.rawBase })
  verifyFiles(record, files)

  const target = join(l.storeDir, record.id)
  const resolvedTarget = resolve(target)
  for (const file of record.files) {
    const dest = resolve(resolvedTarget, file.path)
    if (dest !== resolvedTarget && !dest.startsWith(resolvedTarget + sep)) {
      throw new MissingSourceError(`unsafe file path (escapes store): ${file.path}`)
    }
  }

  if (!opts.dryRun) {
    for (const [path, bytes] of files) {
      const dest = join(target, path)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, bytes)
    }
  }

  return {
    id: record.id,
    ref: record.source.ref,
    contentHash: record.contentHash,
    provenanceTier: record.provenanceTier,
    installedAt: (opts.now ?? new Date()).toISOString(),
    files: record.files,
    active: false,
    riskLevel: record.risk.level,
    total: record.scores.total,
  }
}
