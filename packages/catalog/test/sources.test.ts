import { describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import { fetchAgentskills } from "../src/sources/agentskills.ts"
import { fetchRepoSkills } from "../src/sources/github.ts"

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
    const candidates = await fetchRepoSkills({ repo: "acme/skills", ref: "main", fetchImpl })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.source.ref).toBe("abc123")
    expect(candidates[0]?.files).toHaveLength(2)
  })
})

describe("agentskills adapter", () => {
  it("unzips a downloaded skill", async () => {
    const zip = zipSync({ "SKILL.md": new TextEncoder().encode("---\nname: from-api\ndescription: d\n---\n") })
    const fetchThing = (async (url: string | URL) => {
      const href = String(url)
      if (href.includes("/api/v1/skills")) return json({ data: [{ id: 7, name: "From API", slug: "from-api", category: "writing", installs: 3 }] })
      if (href.includes("/download/7")) return new Response(zip, { status: 200 })
      throw new Error(`unexpected ${href}`)
    }) as unknown as Parameters<typeof fetchAgentskills>[0]["fetchImpl"]
    const candidates = await fetchAgentskills({ baseUrl: "https://example.test", fetchImpl: fetchThing })
    expect(candidates[0]?.source.kind).toBe("marketplace")
    expect(candidates[0]?.files[0]?.path).toBe("SKILL.md")
  })
})
