import { describe, expect, it } from "vitest"
import { ensureDashboard, makeDashboardCommand, makeLazyEnsure } from "../src/dashboard-core.ts"

const healthy = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
const notFound = (async () => new Response("no catalog yet", { status: 404 })) as unknown as typeof fetch
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

  it("reuses a listener that answers with 404 before the catalog is synced", async () => {
    let started = 0
    const result = await ensureDashboard({
      root: "C:/root",
      uiDist: "C:/dist",
      port: 4517,
      fetchImpl: notFound,
      start: async () => {
        started++
        return { url: "http://x/" }
      },
    })
    expect(result).toEqual({ url: "http://127.0.0.1:4517/", started: false })
    expect(started).toBe(0)
  })

  it("probes /api/status with an abort timeout", async () => {
    const calls: { url: string; signal: AbortSignal | null | undefined }[] = []
    const recording = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), signal: init?.signal })
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    await ensureDashboard({
      root: "C:/root",
      uiDist: "C:/dist",
      port: 4599,
      fetchImpl: recording,
      timeoutMs: 500,
      start: async () => ({ url: "http://x/" }),
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe("http://127.0.0.1:4599/api/status")
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal)
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

describe("makeLazyEnsure", () => {
  it("caches a usable result across calls", async () => {
    let calls = 0
    const result = { url: "http://127.0.0.1:4517/", started: false }
    const ensure = makeLazyEnsure(async () => {
      calls++
      return result
    })
    expect(await ensure()).toBe(result)
    expect(await ensure()).toBe(result)
    expect(calls).toBe(1)
  })

  it("does not cache an error result", async () => {
    let calls = 0
    const ensure = makeLazyEnsure(async () => {
      calls++
      return calls === 1 ? { error: "boom" } : { url: "http://127.0.0.1:4517/", started: true }
    })
    expect(await ensure()).toEqual({ error: "boom" })
    expect(await ensure()).toEqual({ url: "http://127.0.0.1:4517/", started: true })
    expect(calls).toBe(2)
  })

  it("retries after a rejected load instead of caching the rejection", async () => {
    let calls = 0
    const ensure = makeLazyEnsure(async () => {
      calls++
      if (calls === 1) throw new Error("boom")
      return { url: "http://127.0.0.1:4517/", started: false }
    })
    await expect(ensure()).rejects.toThrow("boom")
    expect(await ensure()).toEqual({ url: "http://127.0.0.1:4517/", started: false })
    expect(calls).toBe(2)
  })

  it("dedupes concurrent calls into one load and shares the result", async () => {
    let loads = 0
    let resolveLoad!: (result: { url: string; started: boolean }) => void
    const ensure = makeLazyEnsure(() => {
      loads++
      return new Promise((resolve) => {
        resolveLoad = resolve
      })
    })
    const first = ensure()
    const second = ensure()
    const result = { url: "http://127.0.0.1:4517/", started: true }
    resolveLoad(result)
    expect(await first).toBe(result)
    expect(await second).toBe(result)
    expect(loads).toBe(1)
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
