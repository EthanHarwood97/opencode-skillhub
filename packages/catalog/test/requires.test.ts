import { describe, expect, it } from "vitest"
import { extractRequires } from "../src/requires.ts"

describe("extractRequires", () => {
  it("extracts runtimes, scripts, env, mcp, services", () => {
    const body = [
      "# X",
      "Run `python scripts/tool.py --flag` then `npx some-cli`.",
      "Set `OPENAI_API_KEY=...` and `GITHUB_TOKEN`.",
      "Uses the mcp__github server and the Figma API.",
    ].join("\n")
    const r = extractRequires({ body, files: ["SKILL.md", "scripts/tool.py", "run.ps1"] })
    expect(r.runtime).toEqual(["node", "python"])
    expect(r.scripts).toEqual(["run.ps1", "scripts/tool.py"])
    expect(r.env).toEqual(["GITHUB_TOKEN", "OPENAI_API_KEY"])
    expect(r.mcp).toEqual(["github"])
    expect(r.services).toEqual(["figma"])
  })

  it("records body-referenced scripts that are not bundled", () => {
    const r = extractRequires({ body: "Then run `python scripts/missing.py`.", files: ["SKILL.md"] })
    expect(r.scripts).toEqual(["scripts/missing.py"])
  })

  it("normalizes a leading ./ on body-referenced scripts so bundled files match", () => {
    const r = extractRequires({ body: "Then run `./run.ps1`.", files: ["SKILL.md", "run.ps1"] })
    expect(r.scripts).toEqual(["run.ps1"])
  })

  it("extracts and normalizes a Windows-style body reference", () => {
    const bundled = extractRequires({ body: "Then run `.\\run.ps1`.", files: ["SKILL.md", "run.ps1"] })
    expect(bundled.scripts).toEqual(["run.ps1"])
    const unbundled = extractRequires({ body: "Then run `.\\run.ps1`.", files: ["SKILL.md"] })
    expect(unbundled.scripts).toEqual(["run.ps1"])
  })

  it("normalizes internal backslashes in body-referenced scripts so bundled files match", () => {
    const bundled = extractRequires({ body: "Then run `python scripts\\run.py`.", files: ["SKILL.md", "scripts/run.py"] })
    expect(bundled.scripts).toEqual(["scripts/run.py"])
  })

  it("records unbundled backslash references in POSIX form for the penalty check", () => {
    const unbundled = extractRequires({ body: "Then run `python scripts\\missing.py`.", files: ["SKILL.md"] })
    expect(unbundled.scripts).toEqual(["scripts/missing.py"])
  })

  it("returns empty arrays for a plain doc", () => {
    const r = extractRequires({ body: "# T\n\nJust prose about writing.\n", files: ["SKILL.md"] })
    expect(r).toEqual({ runtime: [], scripts: [], mcp: [], env: [], services: [] })
  })
})
