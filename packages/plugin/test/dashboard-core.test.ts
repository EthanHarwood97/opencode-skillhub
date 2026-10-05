import { describe, expect, it } from "vitest"
import { ensureDashboard, makeDashboardCommand } from "../src/dashboard-core.ts"

const healthy = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
const refused = (async () => {
  throw new Error("ECONNREFUSED")
}) as unknown as typeof fetch

describe("ensureDashboard", () => {
  it("reuses a healthy server without starting one", async () => {
    let started = 0
    const result = await ensureDashboard({
      root: "C:/root",
      uiDist: "C:/dist",
      port: 4517,
      fetchImpl: healthy,
      start: async () => {
        started++
        return { url: "http://x/" }
      },
    })
    expect(result).toEqual({ url: "http://127.0.0.1:4517/", started: false })
    expect(started).toBe(0)
  })

  it("starts the server when the probe fails and returns its url", async () => {
    const calls: { root: string; uiDist: string; port: number }[] = []
    const result = await ensureDashboard({
      root: "C:/root",
      uiDist: "C:/dist",
      port: 4517,
      fetchImpl: refused,
      start: async (opts) => {
        calls.push(opts)
        return { url: "http://127.0.0.1:4517/" }
      },
    })
    expect(result).toEqual({ url: "http://127.0.0.1:4517/", started: true })
    expect(calls).toEqual([{ root: "C:/root", uiDist: "C:/dist", port: 4517 }])
  })

  it("explains a missing build instead of starting", async () => {
    const result = await ensureDashboard({ root: "C:/root", uiDist: undefined, port: 4517, fetchImpl: refused, start: async () => ({ url: "http://x/" }) })
    expect(result).toEqual({ error: 'UI is not built — run "npm run ui:build" first' })
  })

  it("surfaces a start failure", async () => {
    const result = await ensureDashboard({
      root: "C:/root",
      uiDist: "C:/dist",
      port: 4517,
      fetchImpl: refused,
      start: async () => {
        throw new Error("port 4517 busy")
      },
    })
    expect(result).toEqual({ error: "could not start the dashboard: port 4517 busy" })
  })
})

describe("makeDashboardCommand", () => {
  it("opens the url and reports it", async () => {
    const opened: string[] = []
    const output = { parts: [] as unknown[] }
    const run = makeDashboardCommand({ ensure: async () => ({ url: "http://127.0.0.1:4517/", started: true }), open: (url) => void opened.push(url) })
    await run(output)
    expect(opened).toEqual(["http://127.0.0.1:4517/"])
    expect(output.parts[0]).toEqual({ type: "text", text: "SkillHub dashboard: http://127.0.0.1:4517/ (started just now) — opened in your browser." })
  })

  it("does not open anything on error and explains why", async () => {
    const opened: string[] = []
    const output = { parts: [] as unknown[] }
    const run = makeDashboardCommand({ ensure: async () => ({ error: "port busy" }), open: (url) => void opened.push(url) })
    await run(output)
    expect(opened).toEqual([])
    expect(output.parts[0]).toEqual({ type: "text", text: "SkillHub dashboard: port busy" })
  })
})
