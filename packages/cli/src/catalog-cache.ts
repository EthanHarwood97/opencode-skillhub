import { cpSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CatalogIndex } from "../../catalog/src/publish.ts"
import type { StoreLayout } from "./paths.ts"

export function readCatalogIndex(catalogDir: string): CatalogIndex {
  const path = join(catalogDir, "index.json")
  if (!existsSync(path)) throw new Error(`no catalog found at ${catalogDir} — run "skillhub catalog import <dir>" first`)
  return JSON.parse(readFileSync(path, "utf8")) as CatalogIndex
}

export function importCatalog(fromDir: string, l: StoreLayout): void {
  for (const file of ["index.json", "clusters.json", "search.db"]) {
    const src = join(fromDir, file)
    if (!existsSync(src)) throw new Error(`catalog artifact missing: ${src}`)
    cpSync(src, join(l.catalogDir, file))
  }
}
