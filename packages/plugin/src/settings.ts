import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_RETRIEVAL, type RetrievalMode, type RetrievalSettings } from "./retrieval-core.ts"

const isMode = (value: unknown): value is RetrievalMode => value === "off" || value === "suggest" || value === "auto"
const ratio = (value: unknown, fallback: number): number => (typeof value === "number" && value >= 0 && value <= 1 ? value : fallback)

export function readRetrievalSettings(root: string, env: NodeJS.ProcessEnv = process.env): RetrievalSettings {
  let raw: Partial<RetrievalSettings> = {}
  const path = join(root, "settings.json")
  if (existsSync(path)) {
    try {
      raw = ((JSON.parse(readFileSync(path, "utf8")) as { retrieval?: Partial<RetrievalSettings> }).retrieval ?? {}) as Partial<RetrievalSettings>
    } catch {
      raw = {}
    }
  }
  const settings: RetrievalSettings = {
    mode: isMode(raw.mode) ? raw.mode : DEFAULT_RETRIEVAL.mode,
    embed: raw.embed === undefined ? DEFAULT_RETRIEVAL.embed : raw.embed === "gemini" ? "gemini" : "off",
    minScore: ratio(raw.minScore, DEFAULT_RETRIEVAL.minScore),
    autoScore: ratio(raw.autoScore, DEFAULT_RETRIEVAL.autoScore),
    maxPointers:
      typeof raw.maxPointers === "number" && raw.maxPointers >= 1 && raw.maxPointers <= 20 ? Math.trunc(raw.maxPointers) : DEFAULT_RETRIEVAL.maxPointers,
  }
  const envMode = env.SKILLHUB_RETRIEVAL
  if (isMode(envMode)) settings.mode = envMode
  return settings
}
