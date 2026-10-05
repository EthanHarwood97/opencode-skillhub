import { describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import { fetchAgentskills } from "../src/sources/agentskills.ts"
import { fetchRepoSkills, searchReposByTopic } from "../src/sources/github.ts"
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
