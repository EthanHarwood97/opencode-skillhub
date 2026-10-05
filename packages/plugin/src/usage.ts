import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type Usage = {
  version: 1
  loads: Record<string, { count: number; lastAt: string }>
  searches: number
  suggestions: number
  lastSuggestedIds: string[]
}

export function usageFileFor(root: string, projectDir: string): string {
  const hash = createHash("sha256").update(projectDir).digest("hex").slice(0, 8)
  return join(root, "projects", hash, "usage.json")
}

const emptyUsage = (): Usage => ({ version: 1, loads: {}, searches: 0, suggestions: 0, lastSuggestedIds: [] })

export function readUsage(file: string): Usage {
  if (!existsSync(file)) return emptyUsage()
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Usage
    if (!parsed || parsed.version !== 1 || typeof parsed.loads !== "object" || parsed.loads === null || Array.isArray(parsed.loads)) {
      return emptyUsage()
    }
    return {
      version: 1,
      loads: parsed.loads,
      searches: typeof parsed.searches === "number" ? parsed.searches : 0,
      suggestions: typeof parsed.suggestions === "number" ? parsed.suggestions : 0,
      lastSuggestedIds: Array.isArray(parsed.lastSuggestedIds) ? parsed.lastSuggestedIds.filter((id): id is string => typeof id === "string") : [],
    }
  } catch {
    return emptyUsage()
  }
}

const write = (file: string, usage: Usage): Usage => {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  writeFileSync(tmp, JSON.stringify(usage, null, 2) + "\n")
  renameSync(tmp, file)
  return usage
}

export function recordLoad(file: string, id: string, now: Date): Usage {
  const usage = readUsage(file)
  const prev = usage.loads[id] ?? { count: 0, lastAt: "" }
  usage.loads[id] = { count: prev.count + 1, lastAt: now.toISOString() }
  return write(file, usage)
}

export function recordSearch(file: string, now: Date): Usage {
  const usage = readUsage(file)
  usage.searches += 1
  return write(file, usage)
}

export function recordSuggestion(file: string, ids: string[], now: Date): Usage {
  const usage = readUsage(file)
  usage.suggestions += 1
  usage.lastSuggestedIds = [...ids]
  return write(file, usage)
}
