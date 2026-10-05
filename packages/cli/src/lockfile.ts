import { existsSync, readFileSync, writeFileSync } from "node:fs"
import type { FileEntry } from "../../catalog/src/types.ts"

export type LockEntry = {
  id: string
  ref?: string
  contentHash: string
  provenanceTier: "sha-pinned" | "content-hash-pinned" | "local"
  installedAt: string
  files: FileEntry[]
  active: boolean
  riskLevel: string
  total: number
}

export type Lockfile = { version: 1; skills: Record<string, LockEntry> }

export function readLockfile(path: string): Lockfile {
  if (!existsSync(path)) return { version: 1, skills: {} }
  return JSON.parse(readFileSync(path, "utf8")) as Lockfile
}

export function writeLockfile(path: string, lock: Lockfile): void {
  const sorted: Lockfile = { version: 1, skills: Object.fromEntries(Object.entries(lock.skills).sort(([a], [b]) => a.localeCompare(b))) }
  writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n")
}

export function upsertEntry(lock: Lockfile, entry: LockEntry): Lockfile {
  const existing = lock.skills[entry.id]
  const next = existing?.active ? { ...entry, active: true } : entry
  return { version: 1, skills: { ...lock.skills, [entry.id]: next } }
}
