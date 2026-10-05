import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CatalogIndex } from "../../catalog/src/publish.ts"
import type { SkillRecord } from "../../catalog/src/types.ts"
import type { FileEntry } from "../../catalog/src/types.ts"
import type { Lockfile } from "../../cli/src/lockfile.ts"

export function readCatalogIndex(root: string): CatalogIndex | undefined {
  const path = join(root, "catalog", "index.json")
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, "utf8")) as CatalogIndex
}

export function readLock(root: string): Lockfile {
  const path = join(root, "lockfile.json")
  if (!existsSync(path)) return { version: 1, skills: {} }
  return JSON.parse(readFileSync(path, "utf8")) as Lockfile
}

export function findRecord(index: CatalogIndex, id: string): SkillRecord | undefined {
  return index.skills.find((s) => s.id === id)
}

export type { FileEntry }
