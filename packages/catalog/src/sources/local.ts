import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join, relative, sep } from "node:path"
import type { Candidate, CandidateFile } from "./types.ts"

/** Symlink-safe file walk (personal skill folders are often junctions). */
const walkFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    let stats
    try {
      stats = statSync(path)
    } catch {
      continue
    }
    if (stats.isDirectory()) out.push(...walkFiles(path))
    else if (stats.isFile()) out.push(path)
  }
  return out
}

/**
 * Local skills root (e.g. `<skillhub>/store/local`): every top-level folder containing a
 * SKILL.md becomes a candidate with id `local/<name>` — the same ids adoption uses, so the
 * manager treats them as installed while the pipeline still scores, labels and compares them.
 */
export function loadLocalSkills(root: string): Candidate[] {
  if (!existsSync(root)) return []
  const out: Candidate[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    let isDirectory = entry.isDirectory()
    if (entry.isSymbolicLink()) {
      try {
        isDirectory = statSync(join(root, entry.name)).isDirectory()
      } catch {
        continue
      }
    }
    if (!isDirectory) continue
    const dir = join(root, entry.name)
    const paths = walkFiles(dir)
    if (!paths.some((path) => basename(path) === "SKILL.md")) continue
    const files: CandidateFile[] = paths.map((path) => {
      const bytes = new Uint8Array(readFileSync(path))
      return { path: relative(dir, path).split(sep).join("/"), bytes, content: new TextDecoder().decode(bytes), size: bytes.byteLength }
    })
    out.push({
      source: { kind: "local", path: `${entry.name}/SKILL.md`, licenseFlags: ["unknown-license"] },
      name: entry.name,
      dir: entry.name,
      tags: [],
      signals: {},
      files,
    })
  }
  return out
}
