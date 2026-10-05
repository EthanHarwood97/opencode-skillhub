import { join } from "node:path"
import type { SearchRow } from "./search-core.ts"
import { buildFtsQuery } from "./search-core.ts"

export class SkillHubRuntimeError extends Error {}

/** Runtime-only: queries search.db through bun:sqlite (opencode's Bun runtime). */
export async function searchRuntime(root: string, query: string, limit = 5, opts: { ftsQuery?: string } = {}): Promise<SearchRow[]> {
  const fts = opts.ftsQuery ?? buildFtsQuery(query)
  if (fts.trim() === "") return []
  let Database: any
  try {
    const bunSqlite: any = await import("bun:sqlite")
    Database = bunSqlite.Database
  } catch {
    throw new SkillHubRuntimeError("bun:sqlite is unavailable in this runtime")
  }
  const db = new Database(join(root, "catalog", "search.db"), { readonly: true })
  try {
    const rows = db
      .prepare(
        `SELECT s.id, s.name, s.description, s.category, s.total, s.risk, s.provenance, s.status, -bm25(skills_fts) AS rank
         FROM skills_fts f JOIN skills s ON s.id = f.id
         WHERE skills_fts MATCH ? ORDER BY bm25(skills_fts), s.total DESC LIMIT ?`,
      )
      .all(fts, limit)
    return rows as SearchRow[]
  } finally {
    db.close()
  }
}
