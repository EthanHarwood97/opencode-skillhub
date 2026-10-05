import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { readCatalogIndex, readLock } from "./catalog-read.ts"
import { estimateAdvertisedTokens, promotionCandidates, readUsage, usageFileFor, type ActiveAdvert } from "./manage-core.ts"
import { estimateTokens, ROUTER_DESCRIPTION } from "./search-core.ts"
import type { StatusInput } from "./status-core.ts"

export function listManagedAdverts(root: string): ActiveAdvert[] {
  const base = join(root, "managed")
  const out: ActiveAdvert[] = []
  if (!existsSync(base)) return out
  for (const org of readdirSync(base)) {
    const orgDir = join(base, org)
    for (const name of readdirSync(orgDir)) {
      const file = join(orgDir, name, "SKILL.md")
      if (!existsSync(file)) continue
      try {
        const parsed = matter(readFileSync(file, "utf8"))
        const fmName = typeof parsed.data.name === "string" ? parsed.data.name : name
        const description = typeof parsed.data.description === "string" ? parsed.data.description : ""
        out.push({ id: `${org}/${name}`, name: fmName, description })
      } catch {
        out.push({ id: `${org}/${name}`, name, description: "" })
      }
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
