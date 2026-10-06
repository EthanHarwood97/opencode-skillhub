import { cpSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs"
import { basename, dirname, join, relative, sep } from "node:path"
import { sha256 } from "../../catalog/src/parse.ts"
import type { FileEntry } from "../../catalog/src/types.ts"
import { copySkillToManaged } from "./activate.ts"
import { readLockfile, upsertEntry, writeLockfile, type LockEntry } from "./lockfile.ts"
import type { StoreLayout } from "./paths.ts"

export type AdoptResult = { adopted: { name: string; id: string }[]; skipped: { name: string; reason: string }[] }

export const localId = (name: string): string => `local/${name}`

/** opencode requires lowercase alphanumeric names with single hyphens, matching the folder. */
export const slugSkillName = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)

/** Symlink-aware file walk: personal skill folders are often junctions/symlinks. */
const walkFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    let stats
    try {
      stats = statSync(path) // follows symlinks; throws on broken links
    } catch {
      continue
    }
    if (stats.isDirectory()) out.push(...walkFiles(path))
    else if (stats.isFile()) out.push(path)
  }
  return out
}

/** Directory containing a SKILL.md directly = one skill. Nested SKILL.md files belong to it. */
export function findSkillDirs(root: string): string[] {
  const dirs: string[] = []
  const visit = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      dirs.push(dir)
      return
    }
    for (const entry of entries) if (entry.isDirectory()) visit(join(dir, entry.name))
  }
  visit(root)
  return dirs
}

/**
 * Import a local skill folder into SkillHub as `local/<name>`: stored, activated in the managed
 * dir, and pinned so autopilot never trims it. Content is copied, never moved.
 */
export function adoptSkillDirectory(l: StoreLayout, skillDir: string, opts: { now?: Date } = {}): LockEntry {
  const name = slugSkillName(basename(skillDir))
  if (!name) throw new Error(`unsuitable skill folder name: ${basename(skillDir)}`)
  const id = localId(name)
  // The skill folder itself may be a junction/symlink (Windows installers love those); copy the
  // real target because fs.cp silently produces an empty dir when the source root is a link.
  let realDir: string
  try {
    realDir = realpathSync(skillDir)
  } catch {
    throw new Error(`unresolvable skill folder: ${skillDir}`)
  }
  const filePaths = walkFiles(realDir)
  if (!filePaths.some((path) => basename(path) === "SKILL.md")) throw new Error(`no SKILL.md in ${skillDir}`)
  const files: FileEntry[] = filePaths.map((path) => {
    const bytes = readFileSync(path)
    return { path: relative(realDir, path).split(sep).join("/"), sha256: sha256(bytes), size: bytes.byteLength }
  })
  const contentHash = sha256(files.map((file) => `${file.path}:${file.sha256}`).join("\n"))
  const target = join(l.storeDir, id)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  cpSync(realDir, target, { recursive: true, dereference: true })
  const entry: LockEntry = {
    id,
    contentHash,
    provenanceTier: "local",
    installedAt: (opts.now ?? new Date()).toISOString(),
    files,
    active: true,
    pinned: true,
    riskLevel: "low",
    total: 0,
  }
  writeLockfile(l.lockfilePath, upsertEntry(readLockfile(l.lockfilePath), entry))
  copySkillToManaged(l, id)
  return entry
}

/** Adopt every skill folder under a root, skipping names that are already installed. */
export function adoptTree(l: StoreLayout, root: string, opts: { now?: Date } = {}): AdoptResult {
  const lock = readLockfile(l.lockfilePath)
  const taken = new Set(Object.keys(lock.skills).map((id) => id.split("/").at(-1)))
  const result: AdoptResult = { adopted: [], skipped: [] }
  for (const dir of findSkillDirs(root)) {
    const name = slugSkillName(basename(dir))
    if (!name) {
      result.skipped.push({ name: basename(dir), reason: "unsuitable skill folder name" })
      continue
    }
    if (taken.has(name)) {
      result.skipped.push({ name, reason: "name already installed" })
      continue
    }
    try {
      const entry = adoptSkillDirectory(l, dir, opts)
      taken.add(name)
      result.adopted.push({ name, id: entry.id })
    } catch (error) {
      result.skipped.push({ name, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
