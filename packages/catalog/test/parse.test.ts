import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { deriveDescription, normalizeText, parseSkillMd, sha256, slugId } from "../src/parse.ts"

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/skills/${name}/SKILL.md`, import.meta.url), "utf8")

describe("parseSkillMd", () => {
  it("parses frontmatter name and description", () => {
    const parsed = parseSkillMd(fixture("good-skill"))
    expect(parsed.name).toBe("good-skill")
    expect(parsed.description).toMatch(/Use when/i)
    expect(parsed.body).toContain("# Good Skill")
  })

  it("throws SkillParseError when frontmatter is missing", () => {
    expect(() => parseSkillMd("# no frontmatter")).toThrow(/missing name/)
  })
})

describe("hashing and ids", () => {
  it("normalizes CRLF before hashing", () => {
    expect(sha256(normalizeText("a\r\nb"))).toBe(sha256(normalizeText("a\nb")))
  })

  it("builds a stable slug id", () => {
    expect(slugId("acme/skills", "My Skill")).toBe("acme-skills/my-skill")
  })
})

describe("deriveDescription", () => {
  it("takes the first paragraph after the title", () => {
    expect(deriveDescription("# T\n\nSome intro text.\n\nMore.")).toBe("Some intro text.")
  })
})
