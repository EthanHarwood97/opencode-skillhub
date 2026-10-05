import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Dirent } from "node:fs"
import { tool } from "@opencode-ai/plugin"

const DEFAULT_MAX_BYTES = 50 * 1024

function findSkillMd(dir: string): string | undefined {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (entry.isFile() && entry.name === "SKILL.md") return join(dir, entry.name)
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nested = findSkillMd(join(dir, entry.name))
    if (nested) return nested
  }
  return undefined
}

export function readSkillBodyFromDisk(root: string, id: string): string | undefined {
  for (const base of ["managed", "store"]) {
    const dir = join(root, base, id)
    if (!existsSync(dir)) continue
    const direct = join(dir, "SKILL.md")
    if (existsSync(direct)) return readFileSync(direct, "utf8")
    const nested = findSkillMd(dir)
    if (nested) return readFileSync(nested, "utf8")
  }
  return undefined
}

export async function renderLoadResult(input: {
  id: string
  body: string
  riskLevel?: string
  maxBytes?: number
  spill?: (content: string) => Promise<string>
}): Promise<string> {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES
  const header = `SkillHub load: ${input.id}${input.riskLevel ? ` risk=${input.riskLevel}` : ""}`
  const bytes = Buffer.byteLength(input.body)
  if (bytes <= maxBytes) return `${header}\n\n${input.body}`
  if (!input.spill) return `${header}\n\n(omitted: ${bytes} bytes exceeds ${maxBytes} and no spill target available)`
  const path = await input.spill(input.body)
  return `${header}\n\n(full body ${bytes} bytes written to ${path})`
}

export function makeLoadTool(deps: {
  read: (id: string) => Promise<string | undefined>
  riskFor?: (id: string) => Promise<string | undefined>
  spill?: (content: string) => Promise<string>
}) {
  return tool({
    description: "Load the full SKILL.md body for a SkillHub id returned by skillhub_search. Requires permission.",
    args: { id: tool.schema.string() },
    async execute(args: { id: string }, context) {
      await context.ask({ permission: "skillhub_load", patterns: [args.id], always: [], metadata: { id: args.id } })
      const body = await deps.read(args.id)
      if (body === undefined) return `SkillHub: "${args.id}" is not installed or not found. Run skillhub install ${args.id} first.`
      return renderLoadResult({ id: args.id, body, riskLevel: await deps.riskFor?.(args.id), spill: deps.spill })
    },
  })
}
