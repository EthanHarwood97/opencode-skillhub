import { homedir } from "node:os"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

export type StoreLayout = {
  root: string
  catalogDir: string
  storeDir: string
  managedDir: string
  lockfilePath: string
  overridesPath: string
}

export function resolveHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.SKILLHUB_HOME ?? join(homedir(), ".config", "opencode", ".skillhub")
}

export function layout(root: string): StoreLayout {
  return {
    root,
    catalogDir: join(root, "catalog"),
    storeDir: join(root, "store"),
    managedDir: join(root, "managed"),
    lockfilePath: join(root, "lockfile.json"),
    overridesPath: join(root, "overrides.json"),
  }
}

export function ensureDirs(l: StoreLayout): void {
  for (const dir of [l.root, l.catalogDir, l.storeDir, l.managedDir]) mkdirSync(dir, { recursive: true })
}
