import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { scanSkill } from "../src/scan.ts"

const body = (name: string) =>
  readFileSync(new URL(`../../../fixtures/skills/${name}/SKILL.md`, import.meta.url), "utf8")

describe("scanSkill", () => {
  it("flags injection and exfiltration in the risky fixture as critical", () => {
    const risk = scanSkill(body("risky-skill"))
    expect(risk.level).toBe("critical")
    expect(risk.findings.map((f) => f.rule)).toEqual(
      expect.arrayContaining(["injection.ignore-previous", "exfil.credential-paths"]),
    )
  })

  it("keeps the good fixture at low risk", () => {
    expect(scanSkill(body("good-skill")).level).toBe("low")
  })

  it("records line numbers", () => {
    const risk = scanSkill(body("risky-skill"))
    expect(risk.findings[0]?.line).toBeGreaterThan(0)
  })

  it("accepts extra rules", () => {
    const risk = scanSkill("# x\n", {
      extraRules: [{ rule: "custom.test", category: "shell", severity: "high", re: /x/ }],
    })
    expect(risk.level).toBe("high")
  })

  it("flags writes to Windows paths with single backslashes", () => {
    const risk = scanSkill("> C:\\Windows\\System32\\temp.txt\n")
    expect(risk.findings).toContainEqual(
      expect.objectContaining({ rule: "fs.write-outside-skill", severity: "medium" }),
    )
    expect(risk.level).toBe("medium")
  })
})
