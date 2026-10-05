import { DatabaseSync } from "node:sqlite"

export type SearchHit = { id: string; name: string; description: string; category: string; total: number; risk: string; provenance: string; status: string }

export function searchSkills(dbPath: string, query: string, opts: { limit?: number; category?: string } = {}): SearchHit[] {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const fts = query.trim().split(/\s+/).map((t) => `"${t.replace(/"/g, "")}"`).join(" ")
    const rows = db
      .prepare(
        `SELECT s.id, s.name, s.description, s.category, s.total, s.risk, s.provenance, s.status
         FROM skills_fts f JOIN skills s ON s.id = f.id
         WHERE skills_fts MATCH ? AND (? IS NULL OR s.category = ?)
         ORDER BY bm25(skills_fts), s.total DESC LIMIT ?`,
      )
      .all(fts, opts.category ?? null, opts.category ?? null, opts.limit ?? 5)
    return rows.map((r: any) => ({ id: r.id, name: r.name, description: r.description, category: r.category, total: r.total, risk: r.risk, provenance: r.provenance, status: r.status }))
  } finally {
    db.close()
  }
}
