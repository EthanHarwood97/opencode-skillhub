import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { copyTreeDeref } from "./copy.ts"
import { readLockfile, writeLockfile } from "./lockfile.ts"
import type { StoreLayout } from "./paths.ts"

const setActive = (l: StoreLayout, id: string, active: boolean) => {
  const lock = readLockfile(l.lockfilePath)
  const entry = lock.skills[id]
  if (!entry) throw new Error(`not installed: ${id}`)
  lock.skills[id] = { ...entry, active }
  writeLockfile(l.lockfilePath, lock)
}

/**
 * opencode requires a skill's frontmatter `name` to match the directory that contains its
 * SKILL.md. Some upstream skills ship a mismatched name (e.g. `gpt-taste` inside `gpt-tasteskill/`),
 * which makes opencode skip them. The managed copy is a derived artifact, so normalize it here —
 * the hash-verified store copy stays untouched.
 */
const normalizeManagedSkillName = (managedRoot: string, skillDirName: string): void => {
  let files: string[]
  try {
    files = readdirSync(managedRoot, { recursive: true }) as string[]
  } catch {
    return
  }
  for (const relative of files) {
    const path = join(managedRoot, relative)
    if (basename(path) !== "SKILL.md") continue
    if (basename(dirname(path)) !== skillDirName) continue
    const content = readFileSync(path, "utf8")
    const lines = content.split(/\r?\n/)
    const index = lines.findIndex((line) => /^name:\s*/.test(line))
    if (index === -1) continue
    const current = lines[index]!.replace(/^name:\s*/, "").trim().replace(/^["']|["']$/g, "")
    if (current === skillDirName) continue
    lines[index] = `name: ${skillDirName}`
    writeFileSync(path, lines.join("\n"))
    break
  }
}

export function copySkillToManaged(l: StoreLayout, id: string): void {
  const source = join(l.storeDir, id)
  if (!existsSync(source)) throw new Error(`not installed: ${id}`)
  rmSync(join(l.managedDir, id), { recursive: true, force: true })
  copyTreeDeref(source, join(l.managedDir, id))
  normalizeManagedSkillName(join(l.managedDir, id), id.split("/").at(-1) ?? id)
}

export function removeSkillFromManaged(l: StoreLayout, id: string): void {
  rmSync(join(l.managedDir, id), { recursive: true, force: true })
}

export function activateSkill(l: StoreLayout, id: string): void {
  copySkillToManaged(l, id)
  setActive(l, id, true)
}

export function deactivateSkill(l: StoreLayout, id: string): void {
  removeSkillFromManaged(l, id)
  setActive(l, id, false)
}
