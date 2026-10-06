import { describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import { fetchAgentskills } from "../src/sources/agentskills.ts"
import { fetchRepoSkills, searchReposByTopic } from "../src/sources/github.ts"
import { fetchSeedRepos } from "../src/sources/seeds.ts"
import { RateLimitError, mapLimit } from "../src/sources/util.ts"

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
const raw = (text: string) => new Response(text, { status: 200 })
const fetchImpl = (async (url: string | URL) => {
  const href = String(url)
  if (href.includes("/git/trees/")) {
    return json({
      sha: "abc123",
      tree: [
        { path: "skills/demo/SKILL.md", type: "blob", sha: "1" },
        { path: "skills/demo/notes.md", type: "blob", sha: "2" },
      ],
    })
  }
  if (href.startsWith("https://raw.githubusercontent.com/")) {
    return raw(href.endsWith("SKILL.md") ? "---\nname: demo\ndescription: d\n---\n\n# demo\n" : "notes")
  }
  throw new Error(`unexpected fetch ${href}`)
}) as unknown as Parameters<typeof fetchRepoSkills>[0]["fetchImpl"]

describe("github adapter", () => {
  it("turns a repo tree into candidates with fetched contents", async () => {
    const signals = { stars: 5, pushedAt: "2026-09-01T00:00:00Z" }
    const candidates = await fetchRepoSkills({ repo: "acme/skills", ref: "main", fetchImpl, signals })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.source.ref).toBe("abc123")
    expect(candidates[0]?.files).toHaveLength(2)
    expect(candidates[0]?.signals).toEqual(signals)
  })
})

describe("agentskills adapter", () => {
  it("unzips a downloaded skill", async () => {
    const zip = zipSync({ "SKILL.md": new TextEncoder().encode("---\nname: from-api\ndescription: d\n---\n") })
    const fetchThing = (async (url: string | URL) => {
      const href = String(url)
      if (href.includes("/api/v1/skills")) {
        return json({
          data: [
            { id: 7, name: "From API", slug: "from-api", category: "writing", installs: 3, author: "acme" },
            { id: 8, name: "No Author", slug: "no-author" },
          ],
        })
      }
      if (href.includes("/download/7") || href.includes("/download/8")) return new Response(zip, { status: 200 })
      throw new Error(`unexpected ${href}`)
    }) as unknown as Parameters<typeof fetchAgentskills>[0]["fetchImpl"]
    const candidates = await fetchAgentskills({ baseUrl: "https://example.test", fetchImpl: fetchThing })
    expect(candidates[0]?.source.kind).toBe("marketplace")
    expect(candidates[0]?.source.repo).toBe("acme")
    expect(candidates[1]?.source.repo).toBe("marketplace")
    expect(candidates[0]?.files[0]?.path).toBe("SKILL.md")
    expect(candidates[0]?.files[0]?.bytes).toBeInstanceOf(Uint8Array)
    expect(candidates[0]?.categoryHint).toBe("writing")
  })
})

describe("github adapter upgrades", () => {
  it("returns default branches and licenses from topic search", async () => {
    const fetchThing = (async () =>
      new Response(
        JSON.stringify({
          items: [{ full_name: "acme/skills", default_branch: "main", stargazers_count: 12, forks_count: 3, pushed_at: "2026-09-01T00:00:00Z", created_at: "2025-01-01T00:00:00Z", archived: false, license: { spdx_id: "MIT" } }],
        }),
        { status: 200 },
      )) as unknown as Parameters<typeof searchReposByTopic>[0]["fetchImpl"]
    const hits = await searchReposByTopic({ topic: "claude-skills", fetchImpl: fetchThing })
    expect(hits[0]).toMatchObject({ repo: "acme/skills", defaultBranch: "main", license: "MIT", archived: false })
  })

  it("throws RateLimitError when GitHub reports exhausted quota", async () => {
    const fetchThing = (async () =>
      new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "123" } })) as unknown as Parameters<typeof searchReposByTopic>[0]["fetchImpl"]
    await expect(searchReposByTopic({ topic: "x", fetchImpl: fetchThing })).rejects.toBeInstanceOf(RateLimitError)
  })

  it("paginates topic sweeps and applies star/pushed qualifiers", async () => {
    const urls: string[] = []
    const fetchThing = (async (url: string | URL) => {
      urls.push(String(url))
      const page = new URL(String(url)).searchParams.get("page")
      const items =
        page === "1"
          ? Array.from({ length: 100 }, (_, index) => ({ full_name: `acme/r${index}`, default_branch: "main", stargazers_count: 20, forks_count: 0, pushed_at: null, created_at: null, archived: false }))
          : [{ full_name: "acme/extra", default_branch: "main", stargazers_count: 20, forks_count: 0, pushed_at: null, created_at: null, archived: false }]
      return new Response(JSON.stringify({ items }), { status: 200 })
    }) as unknown as Parameters<typeof searchReposByTopic>[0]["fetchImpl"]
    const hits = await searchReposByTopic({ topic: "skills", fetchImpl: fetchThing, limit: 101, pages: 2, minStars: 10, pushedAfter: "2026-01-01" })
    expect(hits).toHaveLength(101)
    expect(urls).toHaveLength(2)
    const first = decodeURIComponent(urls[0]!)
    expect(first).toContain("stars:>=10")
    expect(first).toContain("pushed:>=2026-01-01")
  })

  it("attaches category and label hints to repo skills", async () => {
    const candidates = await fetchRepoSkills({ repo: "acme/skills", ref: "main", fetchImpl, categoryHint: "games", labelHints: ["godot"] })
    expect(candidates[0]?.categoryHint).toBe("games")
    expect(candidates[0]?.labelHints).toEqual(["godot"])
  })
})

describe("seed repos adapter", () => {
  it("fetches curated repos with hints and collects warnings for failures", async () => {
    const fetchThing = (async (url: string | URL) => {
      const href = String(url)
      if (href === "https://api.github.com/repos/acme/good") {
        return json({ full_name: "acme/good", default_branch: "main", stargazers_count: 9, forks_count: 1, pushed_at: null, created_at: null, archived: false, license: { spdx_id: "MIT" } })
      }
      if (href === "https://api.github.com/repos/acme/bad") return new Response("{}", { status: 404 })
      if (href.includes("/git/trees/")) return json({ sha: "abc", tree: [{ path: "skills/demo/SKILL.md", type: "blob" }] })
      if (href.startsWith("https://raw.githubusercontent.com/")) return raw("---\nname: demo\ndescription: d\n---\n")
      throw new Error(`unexpected ${href}`)
    }) as unknown as Parameters<typeof fetchSeedRepos>[0]["fetchImpl"]
    const result = await fetchSeedRepos({
      seeds: [
        { repo: "acme/good", category: "games", labels: ["godot"] },
        { repo: "acme/bad" },
        { repo: "not a repo" },
      ],
      fetchImpl: fetchThing,
    })
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.categoryHint).toBe("games")
    expect(result.candidates[0]?.labelHints).toEqual(["godot"])
    expect(result.warnings).toEqual(["acme/bad: github repo lookup failed: 404", 'invalid seed repo "not a repo"'])
  })
})

describe("mapLimit", () => {
  it("preserves order and respects the concurrency limit", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return n * 2
    })
    expect(out).toEqual([2, 4, 6, 8, 10])
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })
})
