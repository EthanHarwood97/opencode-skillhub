import type { Candidate, CandidateFile, FetchLike } from "./types.ts"

const headers = (token?: string) => ({
  accept: "application/vnd.github+json",
  "user-agent": "skillhub-phase1",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
})

export async function searchReposByTopic(opts: {
  topic: string
  token?: string
  fetchImpl: FetchLike
  limit?: number
}): Promise<{ repo: string; signals: Record<string, number | string | boolean | null>; license?: string; archived: boolean }[]> {
  const limit = opts.limit ?? 50
  const url = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(opts.topic)}&per_page=${Math.min(100, limit)}`
  const res = await (opts.fetchImpl as unknown as typeof fetch)(url, { headers: headers(opts.token) })
  if (!res.ok) throw new Error(`github search failed: ${res.status}`)
  const body = (await res.json()) as { items: any[] }
  return body.items.slice(0, limit).map((item) => ({
    repo: item.full_name as string,
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
}): Promise<Candidate[]> {
  const api = async <T>(url: string): Promise<T> => {
    const res = await (opts.fetchImpl as unknown as typeof fetch)(url, { headers: headers(opts.token) })
    if (!res.ok) throw new Error(`github ${url} -> ${res.status}`)
    return (await res.json()) as T
  }

  const tree = await api<{ tree: { path: string; type: string; size?: number; sha: string }[]; sha: string }>(
    `https://api.github.com/repos/${opts.repo}/git/trees/${opts.ref}?recursive=1`,
  )
  const skillDirs = [...new Set(tree.tree.filter((n) => n.type === "blob" && n.path.endsWith("/SKILL.md")).map((n) => n.path.slice(0, -"/SKILL.md".length)))]
  const candidates: Candidate[] = []

  for (const dir of skillDirs) {
    const paths = tree.tree.filter((n) => n.type === "blob" && n.path.startsWith(`${dir}/`)).map((n) => n.path)
    if (paths.length > 50) continue
    const files: CandidateFile[] = []
    for (const path of paths) {
      const res = await (opts.fetchImpl as unknown as typeof fetch)(`https://raw.githubusercontent.com/${opts.repo}/${tree.sha}/${path}`, {
        headers: headers(opts.token),
      })
      if (!res.ok) throw new Error(`raw fetch failed for ${path}`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      files.push({ path, bytes, content: new TextDecoder().decode(bytes), size: bytes.byteLength })
    }
    candidates.push({
      source: { kind: "github", repo: opts.repo, path: `${dir}/SKILL.md`, ref: tree.sha, license: opts.license, licenseFlags: [] },
      name: dir.split("/").at(-1) ?? dir,
      dir,
      tags: dir.split("/").slice(0, -1).slice(-2),
      signals: {},
      files,
    })
  }
  return candidates
}
