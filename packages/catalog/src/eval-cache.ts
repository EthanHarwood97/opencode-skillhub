import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export type EvalCacheEntry = {
  contentHash: string
  rubricVersion: string
  score: number
  dimensions: Record<string, number>
  reasoning: string
  flags: string[]
  model: string
  costUsd: number
  evaluatedAt: string
}

export type EvalCache = { version: 1; entries: Record<string, EvalCacheEntry> }

export const evalKey = (contentHash: string, rubricVersion: string): string => `${contentHash}:${rubricVersion}`

export function readEvalCache(file: string): EvalCache {
  if (!existsSync(file)) return { version: 1, entries: {} }
  return JSON.parse(readFileSync(file, "utf8")) as EvalCache
}

export function writeEvalCache(file: string, cache: EvalCache): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(cache, null, 2) + "\n")
}
