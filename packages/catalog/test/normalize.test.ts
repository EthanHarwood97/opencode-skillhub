import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { normalizeCandidate } from "../src/normalize.ts"
import { sha256 } from "../src/parse.ts"
import type { Candidate } from "../src/sources/types.ts"

const now = new Date("2026-10-05T00:00:00Z")
const content = (name: string) =>
  readFileSync(new URL(`../../../fixtures/skills/${name}/SKILL.md`, import.meta.url), "utf8")

const candidate = (name: string, overrides: Partial<Candidate> = {}): Candidate => ({
  source: { kind: "github", repo: "acme/skills", path: `skills/${name}/SKILL.md`, ref: "abc123", license: "MIT", licenseFlags: [] },
  name,
  dir: `skills/${name}`,
  tags: [name.replace("-skill", "")],
  signals: { stars: 10, pushedAt: "2026-09-01T00:00:00Z" },
  files: [
    { path: `skills/${name}/SKILL.md`, content: content(name), sha256: "placeholder", size: content(name).length },
  ],
  ...overrides,
})

describe("normalizeCandidate", () => {
  it("produces a scored, clustered record for a healthy candidate", () => {
    const { record } = normalizeCandidate(candidate("good-skill"), { now })
    expect(record?.id).toBe("acme-skills/good-skill")
    expect(record?.status).toBe("candidate")
    expect(record?.provenanceTier).toBe("sha-pinned")
    expect(record?.files[0]?.sha256).toHaveLength(64)
    expect(record?.clusterId).toBe("engineering/good")
    expect(record?.scores.total).toBeGreaterThan(0)
  })

  it("quarantines critical scan findings instead of dropping them", () => {
    const { record } = normalizeCandidate(candidate("risky-skill"), { now })
    expect(record?.status).toBe("quarantined")
  })

  it("rejects candidates whose gate failures are non-scan", () => {
    const { record, rejected } = normalizeCandidate(
      candidate("stale-skill", { signals: { pushedAt: "2023-01-01T00:00:00Z" } }),
      { now },
    )
    expect(record).toBeUndefined()
    expect(rejected?.reason).toMatch(/maintenance/)
  })

  it("rejects candidates with no SKILL.md content", () => {
    const { rejected } = normalizeCandidate(candidate("good-skill", { files: [] }), { now })
    expect(rejected?.reason).toMatch(/SKILL\.md/)
  })

  it("pins file hashes over raw bytes when provided (BOM preserved)", () => {
    const raw = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("---\nname: bom-skill\ndescription: d\n---\n\nBody.\n")])
    const text = new TextDecoder().decode(raw)
    expect(sha256(raw)).not.toBe(sha256(text))
    const { record } = normalizeCandidate(
      {
        ...candidate("good-skill"),
        name: "bom-skill",
        dir: "bom-skill",
        files: [{ path: "bom-skill/SKILL.md", content: text, bytes: raw, size: raw.byteLength }],
      },
      { now },
    )
    expect(record?.files[0]?.sha256).toBe(sha256(raw))
    expect(record?.files[0]?.size).toBe(raw.byteLength)
  })

  it("flags the derived summary when frontmatter has no description", () => {
    const raw = "---\nname: derived-skill\n---\n\nA concise derived summary for this skill.\n"
    const { record } = normalizeCandidate(
      {
        ...candidate("good-skill"),
        name: "derived-skill",
        dir: "derived-skill",
        files: [{ path: "derived-skill/SKILL.md", content: raw }],
      },
      { now },
    )
    expect(record?.summaryDerived).toBe("A concise derived summary for this skill.")
    expect(record?.description).toBe("A concise derived summary for this skill.")
  })

  it("leaves summaryDerived unset when frontmatter has a description", () => {
    const { record } = normalizeCandidate(candidate("good-skill"), { now })
    expect(record?.description).toBeTruthy()
    expect(record?.summaryDerived).toBeUndefined()
  })

  it("extracts requirements and body in the normalize result", () => {
    const withRequires = candidate("good-skill")
    const skillFile = withRequires.files[0]!
    skillFile.content = `${skillFile.content}\n\nRun \`python scripts/missing.py\` with \`OPENAI_API_KEY\`.\n`
    skillFile.bytes = new TextEncoder().encode(skillFile.content)
    const { record, body } = normalizeCandidate(withRequires, { now })
    expect(record?.requires.runtime).toEqual(["python"])
    expect(record?.requires.scripts).toEqual(["scripts/missing.py"])
    expect(record?.requires.env).toEqual(["OPENAI_API_KEY"])
    expect(record?.scores.compatibility).toBe(90)
    expect(body).toContain("# Good Skill")
  })

  it("compares bundled scripts in skill-relative space", () => {
    const body = [
      "---",
      "name: demo",
      "description: Demo skill. Use when testing skill-relative script matching.",
      "---",
      "",
      "# Demo",
      "",
      "Run `python scripts/run.py`.",
      "",
    ].join("\n")
    const { record } = normalizeCandidate(
      {
        ...candidate("good-skill"),
        name: "demo",
        dir: "skills/demo",
        source: { kind: "github", repo: "acme/skills", path: "skills/demo/SKILL.md", ref: "abc123", license: "MIT", licenseFlags: [] },
        files: [
          { path: "skills/demo/SKILL.md", content: body },
          { path: "skills/demo/scripts/run.py", content: "print(1)" },
        ],
      },
      { now },
    )
    expect(record?.requires.scripts).toEqual(["scripts/run.py"])
    expect(record?.scores.compatibility).toBe(100)
  })
})
