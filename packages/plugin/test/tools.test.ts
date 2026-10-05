import { describe, expect, it, vi } from "vitest"
import { makeRouterTool } from "../src/tools.ts"
import type { SearchRow } from "../src/search-core.ts"

const row: SearchRow = {
  id: "a/one", name: "one", description: "does one", category: "writing",
  total: 91, risk: "low", provenance: "sha-pinned", status: "candidate",
}

describe("makeRouterTool", () => {
  it("exposes the router description and returns formatted hits", async () => {
    const t = makeRouterTool({ search: async () => [row] })
    expect(t.description).toContain("SkillHub library")
    const out = await t.execute({ query: "one" }, {} as any)
    expect(typeof out === "string" ? out : out.output).toContain("a/one")
  })

  it("returns a no-match message without throwing", async () => {
    const t = makeRouterTool({ search: async () => [] })
    const out = await t.execute({ query: "zzz" }, {} as any)
    expect(typeof out === "string" ? out : out.output).toContain("No matching skills")
  })

  it("short-circuits a blank query without calling search", async () => {
    const search = vi.fn(async () => [row])
    const t = makeRouterTool({ search })
    const out = await t.execute({ query: "   " }, {} as any)
    expect(typeof out === "string" ? out : out.output).toMatch(/No matching skills/)
    expect(search).not.toHaveBeenCalled()
  })
})
