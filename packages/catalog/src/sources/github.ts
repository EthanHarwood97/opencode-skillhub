import type { Candidate, CandidateFile, FetchLike } from "./types.ts"
import { mapLimit, RateLimitError } from "./util.ts"

const headers = (token?: string) => ({
  accept: "application/vnd.github+json",
  "user-agent": "skillhub-phase3",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
})

const isRateLimited = (res: { status: number; headers?: { get(name: string): string | null } }): boolean =>
  (res.status === 403 || res.status === 429) && res.headers?.get("x-ratelimit-remaining") === "0"

const checkRateLimit = (res: { status: number; headers?: { get(name: string): string | null } }): void => {
  if (isRateLimited(res)) throw new RateLimitError(res.headers?.get("x-ratelimit-reset") ?? null)
}

export type RepoSearchHit = {
  repo: string
  defaultBranch: string
  signals: Record<string, number | string | boolean | null>
  license?: string
  archived: boolean
}

export async function searchReposByTopic(opts: {
  topic: string
  token?: string
  fetchImpl: FetchLike
  limit?: number
  page?: number
}): Promise<RepoSearchHit[]> {
  const limit = opts.limit ?? 50
  const page = opts.page ?? 1
  const url = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(opts.topic)}&per_page=${Math.min(100, limit)}&page=${page}&sort=stars&order=desc`
  const res = await (opts.fetchImpl as unknown as typeof fetch)(url, { headers: headers(opts.token) })
  checkRateLimit(res)
  if (!res.ok) throw new Error(`github search failed: ${res.status}`)
  const body = (await res.json()) as { items: any[] }
  return body.items.slice(0, limit).map((item) => ({
    repo: item.full_name as string,
    defaultBranch: (item.default_branch as string | undefined) ?? "HEAD",
    signals: {
      stars: item.stargazers_count ?? 0,
      forks: item.forks_count ?? 0,
      pushedAt: item.pushed_at ?? null,
      createdAt: item.created_at ?? null,
      archived: Boolean(item.archived),
    },
    license: item.license?.spdx_id && item.license.spdx_id !== "NOASSERTION" ? item.license.spdx_id : undefined,
    archived: Boolean(item.archived),
  }))
}

export async function fetchRepoSkills(opts: {
  repo: string
  ref: string
  token?: string
  fetchImpl: FetchLike
  license?: string
  maxSkills?: number
  maxFileBytes?: number
  concurrency?: number
}): Promise<Candidate[]> {
  const api = async <T>(url: string): Promise<T> => {
    const res = await (opts.fetchImpl as unknown as typeof fetch)(url, { headers: headers(opts.token) })
    checkRateLimit(res)
    if (!res.ok) throw new Error(`github ${url} -> ${res.status}`)
    return (await res.json()) as T
  }

  const tree = await api<{ tree: { path: string; type: string; size?: number; sha: string }[]; sha: string }>(
    `https://api.github.com/repos/${opts.repo}/git/trees/${opts.ref}?recursive=1`,
  )
  const allDirs = [
    ...new Set(tree.tree.filter((node) => node.type === "blob" && node.path.endsWith("/SKILL.md")).map((node) => node.path.slice(0, -"/SKILL.md".length))),
  ]
  const dirs = typeof opts.maxSkills === "number" ? allDirs.slice(0, opts.maxSkills) : allDirs
  const maxBytes = opts.maxFileBytes ?? 262_144
  const concurrency = opts.concurrency ?? 4

  const results = await mapLimit(dirs, concurrency, async (dir): Promise<Candidate | undefined> => {
    const paths = tree.tree.filter((node) => node.type === "blob" && node.path.startsWith(`${dir}/`)).map((node) => node.path)
    if (paths.length > 50) return undefined
    const files: CandidateFile[] = []
    for (const path of paths) {
      const res = await (opts.fetchImpl as unknown as typeof fetch)(`https://raw.githubusercontent.com/${opts.repo}/${tree.sha}/${path}`, {
        headers: headers(opts.token),
      })
      if (!res.ok) throw new Error(`raw fetch failed for ${path}`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength > maxBytes) continue
      files.push({ path, bytes, content: new TextDecoder().decode(bytes), size: bytes.byteLength })
    }
    if (!files.some((file) => file.path.endsWith("SKILL.md") && file.content)) return undefined
    return {
      source: { kind: "github", repo: opts.repo, path: `${dir}/SKILL.md`, ref: tree.sha, license: opts.license, licenseFlags: [] },
      name: dir.split("/").at(-1) ?? dir,
      dir,
      tags: dir.split("/").slice(0, -1).slice(-2),
      signals: {},
      files,
    }
  })
  return results.filter((candidate): candidate is Candidate => candidate !== undefined)
}
