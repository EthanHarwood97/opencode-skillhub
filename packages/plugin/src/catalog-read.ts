import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CatalogIndex } from "../../catalog/src/publish.ts"
import type { SkillRecord } from "../../catalog/src/types.ts"
import type { FileEntry } from "../../catalog/src/types.ts"
import type { Lockfile } from "../../cli/src/lockfile.ts"

export function readCatalogIndex(root: string): CatalogIndex | undefined {
  const path = join(root, "catalog", "index.json")
  if (!existsSync(path)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CatalogIndex
    return parsed && typeof parsed === "object" && Array.isArray(parsed.skills) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function readLock(root: string): Lockfile {
  const path = join(root, "lockfile.json")
  const fallback: Lockfile = { version: 1, skills: {} }
  if (!existsSync(path)) return fallback
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Lockfile
    return parsed && typeof parsed === "object" && parsed.skills && typeof parsed.skills === "object" ? parsed : fallback
  } catch {
    return fallback
  }
}

export function findRecord(index: CatalogIndex, id: string): SkillRecord | undefined {
  return index.skills.find((s) => s.id === id)
}

export type { FileEntry }
