import { describe, expect, it } from "vitest"
import { applyConfigToSkillHub } from "../src/config-hook.ts"
import { makeStartupNotifier, renderStatus } from "../src/status-core.ts"

describe("applyConfigToSkillHub", () => {
  it("adds the managed dir once and preserves existing paths", () => {
    const cfg: any = { skills: { paths: ["C:/other"] } }
    applyConfigToSkillHub(cfg, { root: "C:/root" })
    const again = applyConfigToSkillHub(cfg, { root: "C:/root" })
    expect(cfg.skills.paths).toContain("C:/other")
    expect(cfg.skills.paths.filter((p: string) => p.includes("managed"))).toHaveLength(1)
    expect(again.addedSkillPath).toBe(false)
  })
  it("adds the /skills command but never overwrites an existing one", () => {
    const cfg: any = {}
    applyConfigToSkillHub(cfg, { root: "C:/root" })
    expect(cfg.command.skills.template).toBeTruthy()
    cfg.command.skills = { description: "custom", template: "custom" }
    applyConfigToSkillHub(cfg, { root: "C:/root" })
    expect(cfg.command.skills.template).toBe("custom")
  })
})

describe("renderStatus", () => {
  it("shows active, updates, proposals and the budget", () => {
    const text = renderStatus({ active: ["a/one"], installed: 3, updates: 1, proposals: [{ id: "a/two", uses: 4 }], demote: [], l1Tokens: 420, l0Tokens: 180 })
    expect(text).toContain("active 1")
    expect(text).toContain("a/one")
    expect(text).toContain("updates available: 1")
    expect(text).toContain("a/two")
    expect(text).toContain("600/1000")
    expect(text).toContain("demote suggestions: none")
    expect(text).not.toContain("over budget")
  })

  it("lists demote suggestions and flags an over-budget block", () => {
    const text = renderStatus({ active: ["a/one"], installed: 3, updates: 0, proposals: [], demote: ["a/two", "a/three"], l1Tokens: 900, l0Tokens: 180 })
    expect(text).toContain("demote suggestions: a/two, a/three")
    expect(text).toContain("1080/1000")
    expect(text).toContain("over budget")
  })
})

describe("makeStartupNotifier", () => {
  it("toasts once for updates and once for proposals", async () => {
    const toasts: string[] = []
    const n = makeStartupNotifier({ toast: async (m) => void toasts.push(m), compute: () => ({ active: [], installed: 0, updates: 2, proposals: [], demote: [], l1Tokens: 0, l0Tokens: 0 }) })
    await n.notifyOnce()
    await n.notifyOnce()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toContain("2 updates")
  })
})
