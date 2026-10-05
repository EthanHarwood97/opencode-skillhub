import { describe, expect, it } from "vitest"
import { CATEGORIES, mapCategory } from "../src/taxonomy.ts"

describe("mapCategory", () => {
  it("maps marketplace labels to canonical categories", () => {
    expect(mapCategory("Developer Tools")).toBe("engineering")
    expect(mapCategory("content")).toBe("writing")
    expect(mapCategory("Infrastructure")).toBe("infrastructure-devops")
  })
  it("falls back for unknown or missing labels", () => {
    expect(mapCategory(undefined)).toBe("engineering")
    expect(mapCategory("nonsense")).toBe("engineering")
    expect(mapCategory("nonsense", "research")).toBe("research")
  })
  it("exposes exactly the canonical categories", () => {
    expect(CATEGORIES).toHaveLength(12)
    expect(new Set(CATEGORIES).size).toBe(12)
  })
})
