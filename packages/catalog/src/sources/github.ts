import type { Signals } from "../types.ts"
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
  signals: Partial<Signals>
  license?: string
  archived: boolean
}

export async function searchReposByTopic(opts: {
  topic: string
  token?: string
  fetchImpl: FetchLike
  limit?: number
  page?: number
  pages?: number
  minStars?: number
  pushedAfter?: string
}): Promise<RepoSearchHit[]> {
  const limit = opts.limit ?? 50
  const firstPage = opts.page ?? 1
  const pages = Math.max(1, opts.pages ?? 1)
  const qualifiers = [`topic:${opts.topic}`]
  if (opts.minStars && opts.minStars > 0) qualifiers.push(`stars:>=${opts.minStars}`)
  if (opts.pushedAfter) qualifiers.push(`pushed:>=${opts.pushedAfter}`)
  const query = qualifiers.join(" ")

  const hits: RepoSearchHit[] = []
  const seen = new Set<string>()
  for (let page = firstPage; page < firstPage + pages && hits.length < limit; page++) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${Math.min(100, limit)}&page=${page}&sort=stars&order=desc`
    const res = await (opts.fetchImpl as unknown as typeof fetch)(url, { headers: headers(opts.token) })
    checkRateLimit(res)
    if (!res.ok) throw new Error(`github search failed: ${res.status}`)
    const body = (await res.json()) as { items: any[] }
    if (body.items.length === 0) break
    for (const item of body.items) {
      if (seen.has(item.full_name)) continue
      seen.add(item.full_name)
      hits.push({
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
      })
    }
  }
  return hits.slice(0, limit)
}

export type RepoInfo = { repo: string; defaultBranch: string; license?: string; archived: boolean; signals: Partial<Signals> }

export async function fetchRepo(opts: { repo: string; token?: string; fetchImpl: FetchLike }): Promise<RepoInfo> {
  const res = await (opts.fetchImpl as unknown as typeof fetch)(`https://api.github.com/repos/${opts.repo}`, { headers: headers(opts.token) })
  checkRateLimit(res)
  if (!res.ok) throw new Error(`github repo lookup failed: ${res.status}`)
  const item = (await res.json()) as any
  return {
    repo: item.full_name as string,
    defaultBranch: (item.default_branch as string | undefined) ?? "HEAD",
    license: item.license?.spdx_id && item.license.spdx_id !== "NOASSERTION" ? item.license.spdx_id : undefined,
    archived: Boolean(item.archived),
    signals: {
      stars: item.stargazers_count ?? 0,
      forks: item.forks_count ?? 0,
      pushedAt: item.pushed_at ?? null,
      createdAt: item.created_at ?? null,
      archived: Boolean(item.archived),
    },
  }
}

const RETRYABLE = /fetch failed|network|socket|terminated|ECONN|ENOTFOUND|EAI_AGAIN|aborted|timeout/i

const getWithRetry = async (url: string, opts: { fetchImpl: FetchLike; token?: string; attempts?: number }): Promise<Response> => {
  const attempts = opts.attempts ?? 3
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await (opts.fetchImpl as unknown as typeof fetch)(url, { headers: headers(opts.token) })
    } catch (error) {
      lastError = error
      const retryable = error instanceof Error && (error.name === "TimeoutError" || RETRYABLE.test(error.message))
      if (!retryable) throw error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 400 * (attempt + 1)))
    }
  }
  throw lastError
}

export async function fetchRepoSkills(opts: {
  repo: string
  ref: string
  token?: string
  fetchImpl: FetchLike
  license?: string
  signals?: Partial<Signals>
  maxSkills?: number
  maxFileBytes?: number
  maxSkillFiles?: number
  concurrency?: number
  categoryHint?: string
  labelHints?: string[]
  licenseFlags?: string[]
}): Promise<Candidate[]> {
  const api = async <T>(url: string): Promise<T> => {
    const res = await getWithRetry(url, { fetchImpl: opts.fetchImpl, token: opts.token })
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
  const maxSkillFiles = opts.maxSkillFiles ?? 150
  const concurrency = opts.concurrency ?? 4

  const results = await mapLimit(dirs, concurrency, async (dir): Promise<Candidate | undefined> => {
    const paths = tree.tree.filter((node) => node.type === "blob" && node.path.startsWith(`${dir}/`)).map((node) => node.path)
    if (paths.length > maxSkillFiles) return undefined
    const fetched = await mapLimit(paths, 4, async (path): Promise<CandidateFile | undefined> => {
      const res = await getWithRetry(`https://raw.githubusercontent.com/${opts.repo}/${tree.sha}/${path}`, { fetchImpl: opts.fetchImpl, token: opts.token })
      if (!res.ok) throw new Error(`raw fetch failed for ${path}`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength > maxBytes) return undefined
      return { path, bytes, content: new TextDecoder().decode(bytes), size: bytes.byteLength }
    })
    const files = fetched.filter((file): file is CandidateFile => file !== undefined)
    if (!files.some((file) => file.path.endsWith("SKILL.md") && file.content)) return undefined
    return {
      source: { kind: "github", repo: opts.repo, path: `${dir}/SKILL.md`, ref: tree.sha, license: opts.license, licenseFlags: opts.licenseFlags ?? [] },
      name: dir.split("/").at(-1) ?? dir,
      dir,
      tags: dir.split("/").slice(0, -1).slice(-2),
      signals: opts.signals ?? {},
      files,
      ...(opts.categoryHint ? { categoryHint: opts.categoryHint } : {}),
      ...(opts.labelHints ? { labelHints: opts.labelHints } : {}),
    }
  })
  return results.filter((candidate): candidate is Candidate => candidate !== undefined)
}
