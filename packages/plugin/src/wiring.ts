import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import type { Dirent } from "node:fs"
import { join, relative } from "node:path"
import matter from "gray-matter"
import { readCatalogIndex, readLock } from "./catalog-read.ts"
import { estimateAdvertisedTokens, promotionCandidates, readUsage, usageFileFor, type ActiveAdvert } from "./manage-core.ts"
import { estimateTokens, ROUTER_DESCRIPTION } from "./search-core.ts"
import type { StatusInput } from "./status-core.ts"

export function listManagedAdverts(root: string): ActiveAdvert[] {
  const base = join(root, "managed")
  const out: ActiveAdvert[] = []
  if (!existsSync(base)) return out

  const walk = (dir: string): string[] => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    const files: string[] = []
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) files.push(...walk(full))
      else if (entry.isFile() && entry.name === "SKILL.md") files.push(full)
    }
    return files
  }

  const best = new Map<string, { rel: string; file: string; depth: number }>()
  for (const file of walk(base)) {
    const rel = relative(base, file).replace(/\\/g, "/")
    const segments = rel.split("/")
    if (segments.length < 3) continue
    const id = `${segments[0]}/${segments[1]}`
    const depth = segments.length
    const current = best.get(id)
    if (!current || depth < current.depth || (depth === current.depth && rel < current.rel)) {
      best.set(id, { rel, file, depth })
    }
  }

  for (const [id, { rel, file }] of best) {
    const fallbackName = rel.split("/").at(-2) ?? ""
    try {
      const parsed = matter(readFileSync(file, "utf8"))
      const fmName = typeof parsed.data.name === "string" ? parsed.data.name : fallbackName
      const description = typeof parsed.data.description === "string" ? parsed.data.description : ""
      out.push({ id, name: fmName, description })
    } catch {
      out.push({ id, name: fallbackName, description: "" })
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export function collectStatus(root: string, projectDir: string, _now?: Date): StatusInput {
  const lock = readLock(root)
  const index = readCatalogIndex(root)
  const usage = readUsage(usageFileFor(root, projectDir))
  const active = Object.entries(lock.skills).filter(([, e]) => e.active).map(([id]) => id).sort()
  const updates = index
    ? Object.entries(lock.skills).filter(([id, e]) => {
        const record = index.skills.find((s) => s.id === id)
        return record !== undefined && record.contentHash !== e.contentHash
      }).length
    : 0
  const adverts = listManagedAdverts(root)
  return {
    active,
    installed: Object.keys(lock.skills).length,
    updates,
    proposals: promotionCandidates({ lock, usage }),
    l1Tokens: estimateAdvertisedTokens(adverts),
    l0Tokens: estimateTokens(ROUTER_DESCRIPTION),
  }
}

export function makeCapture(dir: string | undefined) {
  if (!dir) return { system: undefined, toolCall: undefined } as const
  mkdirSync(dir, { recursive: true })
  return {
    system: (system: string[]) => writeFileSync(join(dir, "system.json"), JSON.stringify(system, null, 2)),
    toolCall: (tool: string) => writeFileSync(join(dir, "tool-calls.jsonl"), `${JSON.stringify({ tool, at: Date.now() })}\n`, { flag: "a" }),
  }
}
