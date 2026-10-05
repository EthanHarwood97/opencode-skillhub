import { unzipSync } from "fflate"
import { mapCategory } from "../taxonomy.ts"
import type { Candidate, CandidateFile, FetchLike } from "./types.ts"

type ApiSkill = { id: number | string; slug?: string; name: string; description?: string; category?: string; installs?: number; views?: number; author?: string }

export async function fetchAgentskills(opts: { baseUrl: string; fetchImpl: FetchLike; limit?: number }): Promise<Candidate[]> {
  const limit = opts.limit ?? 50
  const base = opts.baseUrl.replace(/\/$/, "")
  const res = await (opts.fetchImpl as unknown as typeof fetch)(`${base}/api/v1/skills?limit=${limit}&per_page=${limit}`)
  if (!res.ok) throw new Error(`agentskills search failed: ${res.status}`)
  const body = (await res.json()) as { data?: ApiSkill[]; skills?: ApiSkill[] }
  const items = body.data ?? body.skills ?? []

  const candidates: Candidate[] = []
  for (const item of items.slice(0, limit)) {
    const zipRes = await (opts.fetchImpl as unknown as typeof fetch)(`${base}/api/skills/download/${item.id}`)
    if (!zipRes.ok) continue
    const zip = unzipSync(new Uint8Array(await zipRes.arrayBuffer()))
    const files: CandidateFile[] = Object.entries(zip)
      .filter(([path]) => !path.endsWith("/"))
      .slice(0, 50)
      .map(([path, bytes]) => ({ path, bytes, content: new TextDecoder().decode(bytes), size: bytes.byteLength }))
    if (!files.some((f) => f.path.endsWith("SKILL.md") && f.content)) continue
    const repo = typeof item.author === "string" && item.author.trim().length > 0 ? item.author.trim() : "marketplace"
    candidates.push({
      source: { kind: "marketplace", repo, path: "SKILL.md", url: `${base}/api/skills/download/${item.id}`, licenseFlags: ["unknown-license"] },
      name: item.slug ?? item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      dir: item.slug ?? String(item.id),
      description: item.description,
      tags: item.category ? [item.category.toLowerCase()] : [],
      signals: { installs: item.installs ?? 0, views: item.views ?? 0 },
      files,
      categoryHint: mapCategory(item.category),
    })
  }
  return candidates
}
