import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type Usage = { version: 1; loads: Record<string, { count: number; lastAt: string }>; searches: number }

export function usageFileFor(root: string, projectDir: string): string {
  const hash = createHash("sha256").update(projectDir).digest("hex").slice(0, 8)
  return join(root, "projects", hash, "usage.json")
}

export function readUsage(file: string): Usage {
  if (!existsSync(file)) return { version: 1, loads: {}, searches: 0 }
  return JSON.parse(readFileSync(file, "utf8")) as Usage
}

const write = (file: string, usage: Usage): Usage => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(usage, null, 2) + "\n")
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
