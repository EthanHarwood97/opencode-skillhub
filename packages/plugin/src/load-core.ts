import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import type { Dirent } from "node:fs"
import { tool } from "@opencode-ai/plugin"
import { readLock } from "./catalog-read.ts"

const DEFAULT_MAX_BYTES = 50 * 1024
const ID_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/

export function isValidSkillId(id: string): boolean {
  return ID_PATTERN.test(id)
}

function within(baseDir: string, target: string): boolean {
  const base = resolve(baseDir)
  const resolved = resolve(target)
  return resolved === base || resolved.startsWith(base + sep)
}

function findSkillMd(dir: string, baseDir: string): string | undefined {
  if (!within(baseDir, dir)) return undefined
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (entry.isFile() && entry.name === "SKILL.md") {
      const file = join(dir, entry.name)
      if (within(baseDir, file)) return file
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nested = findSkillMd(join(dir, entry.name), baseDir)
    if (nested) return nested
  }
  return undefined
}

export function readSkillBodyFromDisk(root: string, id: string): string | undefined {
  if (!isValidSkillId(id)) return undefined

  const entry = readLock(root).skills[id]
  const lockPath = entry && Array.isArray(entry.files) ? entry.files.find((f) => f.path === "SKILL.md" || f.path.endsWith("/SKILL.md"))?.path : undefined
  if (lockPath !== undefined) {
    for (const base of ["managed", "store"]) {
      const dir = join(root, base, id)
      const candidate = join(dir, lockPath)
      if (within(dir, candidate) && existsSync(candidate)) return readFileSync(candidate, "utf8")
    }
    return undefined
  }

  for (const base of ["managed", "store"]) {
    const dir = join(root, base, id)
    if (!within(join(root, base), dir) || !existsSync(dir)) continue
    const direct = join(dir, "SKILL.md")
    if (within(dir, direct) && existsSync(direct)) return readFileSync(direct, "utf8")
    const nested = findSkillMd(dir, dir)
    if (nested) return readFileSync(nested, "utf8")
  }
  return undefined
}

export async function renderLoadResult(input: {
  id: string
  body: string
  riskLevel?: string
  maxBytes?: number
  spill?: (content: string, id: string) => Promise<string>
}): Promise<string> {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES
  const header = `SkillHub load: ${input.id}${input.riskLevel ? ` risk=${input.riskLevel}` : ""}`
  const bytes = Buffer.byteLength(input.body)
  if (bytes <= maxBytes) return `${header}\n\n${input.body}`
  if (!input.spill) return `${header}\n\n(omitted: ${bytes} bytes exceeds ${maxBytes} and no spill target available)`
  const path = await input.spill(input.body, input.id)
  return `${header}\n\n(full body ${bytes} bytes written to ${path})`
}

export function makeSpill(root: string): (content: string, id: string) => Promise<string> {
  return async (content, id) => {
    const dir = join(root, "tmp", "loads")
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${id.replace(/[^a-z0-9-]/g, "-")}.md`)
    writeFileSync(file, content)
    return resolve(file)
  }
}

export function makeLoadTool(deps: {
  read: (id: string) => Promise<string | undefined>
  riskFor?: (id: string) => Promise<string | undefined>
  spill?: (content: string, id: string) => Promise<string>
  onLoad?: (id: string) => void | Promise<void>
}) {
  return tool({
    description: "Load the full SKILL.md body for a SkillHub id returned by skillhub_search. Requires permission.",
    args: { id: tool.schema.string() },
    async execute(args: { id: string }, context) {
      if (!isValidSkillId(args.id)) return `SkillHub: invalid skill id "${args.id}"`
      await context.ask({ permission: "skillhub_load", patterns: [args.id], always: [], metadata: { id: args.id } })
      const body = await deps.read(args.id)
      if (body === undefined) return `SkillHub: "${args.id}" is not installed or not found. Run skillhub install ${args.id} first.`
      try {
        await deps.onLoad?.(args.id)
      } catch {}
      return renderLoadResult({ id: args.id, body, riskLevel: await deps.riskFor?.(args.id), spill: deps.spill })
    },
  })
}
