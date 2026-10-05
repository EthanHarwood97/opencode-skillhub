import { describe, expect, it } from "vitest"
import { buildFtsQuery, CAPABILITY_MAP, estimateTokens, formatHits, ROUTER_DESCRIPTION } from "../src/search-core.ts"

describe("buildFtsQuery", () => {
  it("quotes tokens and strips quotes", () => {
    expect(buildFtsQuery('make "pdf" text')).toBe('"make" "pdf" "text"')
  })
  it("drops empty tokens", () => {
    expect(buildFtsQuery("  a   b ")).toBe('"a" "b"')
  })
})

describe("formatHits", () => {
  const rows = [
    { id: "a/one", name: "one", description: "does one", category: "writing", total: 91, risk: "low", provenance: "sha-pinned", status: "candidate" },
    { id: "a/two", name: "two", description: "does two", category: "data", total: 42, risk: "medium", provenance: "content-hash-pinned", status: "candidate" },
  ]
  it("renders one line per hit with score, category, risk", () => {
    const text = formatHits(rows)
    expect(text).toContain("a/one")
    expect(text).toContain("[91]")
    expect(text).toContain("risk=low")
    expect(text.split("\n")).toHaveLength(2)
  })
  it("caps at the limit and handles empties", () => {
    expect(formatHits(rows, 1).split("\n")).toHaveLength(1)
    expect(formatHits([])).toBe("No matching skills.")
  })
})

describe("budget", () => {
  it("keeps the router description within ~250 est. tokens", () => {
    expect(CAPABILITY_MAP.length).toBeGreaterThanOrEqual(12)
    expect(estimateTokens(ROUTER_DESCRIPTION)).toBeLessThanOrEqual(250)
  })
})
