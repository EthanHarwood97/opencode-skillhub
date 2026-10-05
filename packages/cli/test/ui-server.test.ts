import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { makeRecord } from "../../catalog/test/helpers.ts"
import { layout } from "../src/paths.ts"
import { startUiServer, type UiServerHandle } from "../src/ui/server.ts"

const makeStore = () => {
  const root = mkdtempSync(join(tmpdir(), "skillhub-ui-server-"))
  const l = layout(root)
  mkdirSync(l.catalogDir, { recursive: true })
  writeFileSync(
    join(l.catalogDir, "index.json"),
    JSON.stringify({
      version: 1,
      generatedAt: "2026-10-05T00:00:00.000Z",
      counts: { total: 1, byStatus: { candidate: 1 }, byCategory: { engineering: 1 } },
      skills: [makeRecord({ id: "acme/one", name: "One" })],
    }),
  )
  const dist = join(root, "dist")
  mkdirSync(join(dist, "assets"), { recursive: true })
  writeFileSync(join(dist, "index.html"), "<!doctype html><html><head><title>SkillHub</title></head><body><div id=\"root\"></div></body></html>")
  writeFileSync(join(dist, "assets", "app.js"), "console.log('app')")
  return { root, dist }
}

let handle: UiServerHandle | undefined
afterEach(async () => {
  await handle?.close()
  handle = undefined
})

describe("ui server", () => {
  it("serves the API from the store", async () => {
    const { root, dist } = makeStore()
    handle = await startUiServer({ root, uiDist: dist, port: 0 })
    const base = handle.url

    const status = await (await fetch(`${base}api/status`)).json()
    expect(status).toMatchObject({ counts: { total: 1 }, installed: 0 })
    const page = await (await fetch(`${base}api/skills?q=one`)).json()
    expect(page.items.map((c: { id: string }) => c.id)).toEqual(["acme/one"])
    const detail = await (await fetch(`${base}api/skills/${encodeURIComponent("acme/one")}`)).json()
    expect(detail.name).toBe("One")
    expect((await fetch(`${base}api/skills/${encodeURIComponent("acme/nope")}`)).status).toBe(404)
    expect((await (await fetch(`${base}api/clusters`)).json()).clusters).toEqual([])
    expect((await (await fetch(`${base}api/review`)).json()).newCandidates).toEqual([])
  })

  it("serves the UI with token injection and SPA fallback", async () => {
    const { root, dist } = makeStore()
    handle = await startUiServer({ root, uiDist: dist, port: 0 })
    const html = await (await fetch(handle.url)).text()
    expect(html).toContain(`window.__SKILLHUB__={"mode":"live","token":"${handle.token}"}`)
    const fallback = await (await fetch(`${handle.url}gallery`)).text()
    expect(fallback).toContain("window.__SKILLHUB__")
    const asset = await fetch(`${handle.url}assets/app.js`)
    expect(asset.headers.get("content-type")).toContain("text/javascript")
    expect(await asset.text()).toContain("console.log")
  })

  it("returns JSON errors", async () => {
    const { root, dist } = makeStore()
    handle = await startUiServer({ root, uiDist: dist, port: 0 })
    const res = await fetch(`${handle.url}api/nope`)
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe("not_found")
  })

  it("explains a missing catalog", async () => {
    const { root, dist } = makeStore()
    const empty = mkdtempSync(join(tmpdir(), "skillhub-ui-empty-"))
    handle = await startUiServer({ root: empty, uiDist: dist, port: 0 })
    const res = await fetch(`${handle.url}api/status`)
    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toContain("no catalog")
    void root
  })
})
