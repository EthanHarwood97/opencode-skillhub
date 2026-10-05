import { cpSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { readLockfile, writeLockfile } from "./lockfile.ts"
import type { StoreLayout } from "./paths.ts"

const setActive = (l: StoreLayout, id: string, active: boolean) => {
  const lock = readLockfile(l.lockfilePath)
  const entry = lock.skills[id]
  if (!entry) throw new Error(`not installed: ${id}`)
  lock.skills[id] = { ...entry, active }
  writeLockfile(l.lockfilePath, lock)
}

export function activateSkill(l: StoreLayout, id: string): void {
  const source = join(l.storeDir, id)
  if (!existsSync(source)) throw new Error(`not installed: ${id}`)
  rmSync(join(l.managedDir, id), { recursive: true, force: true })
  cpSync(source, join(l.managedDir, id), { recursive: true })
  setActive(l, id, true)
}

export function deactivateSkill(l: StoreLayout, id: string): void {
  rmSync(join(l.managedDir, id), { recursive: true, force: true })
  setActive(l, id, false)
}
