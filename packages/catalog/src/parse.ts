import { createHash } from "node:crypto"
import matter from "gray-matter"

export class SkillParseError extends Error {}

export type ParsedSkill = { name: string; description?: string; body: string; raw: string; category?: string; tags: string[] }

export const sha256 = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex")

export const normalizeText = (s: string): string =>
  s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd() + "\n"

export function parseSkillMd(raw: string): ParsedSkill {
  let data: Record<string, unknown>
  let body: string
  try {
    const parsed = matter(raw)
    data = parsed.data as Record<string, unknown>
    body = parsed.content
  } catch (e) {
    throw new SkillParseError(`invalid frontmatter: ${(e as Error).message}`)
  }
  const name = data.name
  if (typeof name !== "string" || name.length === 0) {
    throw new SkillParseError("missing name in frontmatter")
  }
  const description = typeof data.description === "string" && data.description.length > 0 ? data.description : undefined
  const category = typeof data.category === "string" && data.category.length > 0 ? data.category : undefined
  const tags = Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0) : []
  return { name, description, body: normalizeText(body), raw, category, tags }
}

export function deriveDescription(body: string): string | undefined {
  for (const block of body.split("\n\n")) {
    const trimmed = block.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    return trimmed.length > 300 ? `${trimmed.slice(0, 297)}...` : trimmed
  }
  return undefined
}

export function slugId(repo: string | undefined, dirName: string): string {
  const repoSlug = (repo ?? "local").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  const dirSlug = dirName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  return `${repoSlug}/${dirSlug}`
}
