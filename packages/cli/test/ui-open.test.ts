import { describe, expect, it } from "vitest"
import { browserCommand, openBrowser } from "../src/ui/open.ts"

describe("browserCommand", () => {
  it("selects the platform opener", () => {
    expect(browserCommand("http://x/", "win32")).toEqual({ command: "cmd", args: ["/c", "start", "", "http://x/"] })
    expect(browserCommand("http://x/", "darwin")).toEqual({ command: "open", args: ["http://x/"] })
    expect(browserCommand("http://x/", "linux")).toEqual({ command: "xdg-open", args: ["http://x/"] })
  })
})

describe("openBrowser", () => {
  it("spawns detached and unrefs", () => {
    const records: { command: string; args: string[]; options: unknown; unref: boolean }[] = []
    openBrowser("http://x/", {
      platform: "win32",
      spawnImpl: (command, args, options) => {
        const record = { command, args, options, unref: false }
        records.push(record)
        return { unref: () => { record.unref = true } }
      },
    })
    expect(records).toHaveLength(1)
    expect(records[0]!.command).toBe("cmd")
    expect(records[0]!.options).toEqual({ detached: true, stdio: "ignore" })
    expect(records[0]!.unref).toBe(true)
  })
})
