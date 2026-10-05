import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { zipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { layout } from "../src/paths.ts"
import { startUiServer, type UiServerHandle } from "../src/ui/server.ts"

const skillBody = (marker: string) => `---\nname: zip-skill\ndescription: A marketplace fixture. Use when testing installs.\n---\n\n# Zip Skill\n\n${marker}\n`
const zipFor = (marker: string) => new Response(zipSync({ "SKILL.md": new TextEncoder().encode(skillBody(marker)) }), { status: 200 })
const sha = (text: string) => createHash("sha256").update(text).digest("hex")

const makeStore = (marker: string) => {
  const root = mkdtempSync(join(tmpdir(), "skillhub-ui-mut-"))
  const l = layout(root)
  mkdirSync(l.catalogDir, { recursive: true })
  const body = skillBody(marker)
  const record = {
    id: "acme/zip-skill",
    name: "zip-skill",
    description: "A marketplace fixture. Use when testing installs.",
    category: "engineering",
    tags: ["fixture"],
    clusterId: "c-1",
    clusterLabel: "Fixture",
    source: { kind: "marketplace", path: "SKILL.md", url: "https://fixtures.test/skill.zip", licenseFlags: ["unknown-license"] },
    files: [{ path: "SKILL.md", sha256: sha(body), size: Buffer.byteLength(body) }],
    contentHash: "content-new",
    requires: { runtime: [], scripts: [], mcp: [], env: [], services: [] },
    risk: { level: "low", findings: [] },
    signals: {},
    scores: { total: 60, quality: 60, trust: 60, freshness: 60, compatibility: 60, adoption: 60, reasons: [], rubricVersion: "heuristic-v0", evaluatedAt: "2026-10-05T00:00:00.000Z" },
    provenanceTier: "content-hash-pinned",
    status: "candidate",
    relations: { supersedes: [], duplicates: [], alternatives: [] },
  }
  writeFileSync(
    join(l.catalogDir, "index.json"),
    JSON.stringify({ version: 1, generatedAt: "2026-10-05T00:00:00.000Z", counts: { total: 1, byStatus: { candidate: 1 }, byCategory: { engineering: 1 } }, skills: [record] }),
  )
  return { root, l, record }
}

const fetchImpl = (marker: string) => (async () => zipFor(marker)) as unknown as typeof fetch

let handle: UiServerHandle | undefined
afterEach(async () => {
  await handle?.close()
  handle = undefined
})

const post = (url: string, token: string | undefined, body: unknown, origin?: string) =>
  fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-skillhub-token": token } : {}),
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  })

describe("ui mutations", () => {
  it("verifies before installing, then installs and activates", async () => {
    const { root, l } = makeStore("v1")
    handle = await startUiServer({ root, uiDist: join(root, "dist"), port: 0, fetchImpl: fetchImpl("v1") })
    const base = handle.url

    const dry = await post(`${base}api/skills/acme%2Fzip-skill/install`, handle.token, { dryRun: true })
    expect(dry.status).toBe(200)
    expect((await dry.json()).status).toBe("verified")
    expect(existsSync(l.lockfilePath)).toBe(false)

    const real = await post(`${base}api/skills/acme%2Fzip-skill/install`, handle.token, { dryRun: false })
    expect((await real.json()).status).toBe("installed")
    expect(readFileSync(join(l.storeDir, "acme/zip-skill", "SKILL.md"), "utf8")).toContain("v1")
    expect(readFileSync(l.lockfilePath, "utf8")).toContain("zip-skill")

    expect((await post(`${base}api/skills/acme%2Fzip-skill/activate`, handle.token, {})).status).toBe(200)
    expect(JSON.parse(readFileSync(l.lockfilePath, "utf8")).skills["acme/zip-skill"].active).toBe(true)
    expect((await post(`${base}api/skills/acme%2Fzip-skill/deactivate`, handle.token, {})).status).toBe(200)
    expect(JSON.parse(readFileSync(l.lockfilePath, "utf8")).skills["acme/zip-skill"].active).toBe(false)
  })

  it("guards mutations with token, content-type and origin", async () => {
    const { root } = makeStore("v1")
    handle = await startUiServer({ root, uiDist: join(root, "dist"), port: 0, fetchImpl: fetchImpl("v1") })
    expect((await post(`${handle.url}api/skills/acme%2Fzip-skill/install`, undefined, { dryRun: true })).status).toBe(403)
    const wrongType = await fetch(`${handle.url}api/skills/acme%2Fzip-skill/install`, { method: "POST", headers: { "x-skillhub-token": handle.token }, body: "{}" })
    expect(wrongType.status).toBe(415)
    expect((await post(`${handle.url}api/skills/acme%2Fzip-skill/install`, handle.token, { dryRun: true }, "https://evil.example")).status).toBe(403)
  })

  it("reviews and applies an update", async () => {
    const { root, l, record } = makeStore("v2")
    mkdirSync(join(l.storeDir, "acme/zip-skill"), { recursive: true })
    writeFileSync(join(l.storeDir, "acme/zip-skill", "SKILL.md"), skillBody("v1"))
    writeFileSync(
      l.lockfilePath,
      JSON.stringify({
        version: 1,
        skills: {
          "acme/zip-skill": { id: "acme/zip-skill", contentHash: "content-old", provenanceTier: "content-hash-pinned", installedAt: "", files: [{ path: "SKILL.md", sha256: sha(skillBody("v1")), size: Buffer.byteLength(skillBody("v1")) }], active: false, riskLevel: "low", total: 50 },
        },
      }),
    )
    handle = await startUiServer({ root, uiDist: join(root, "dist"), port: 0, fetchImpl: fetchImpl("v2") })

    const review = await (await fetch(`${handle.url}api/skills/acme%2Fzip-skill/update`)).json()
    expect(review.kind).toBe("update")
    expect(review.changes.map((c: { status: string }) => c.status)).toEqual(["modified"])
    expect(review.scoreDelta).toEqual({ from: 50, to: 60 })

    const apply = await post(`${handle.url}api/skills/acme%2Fzip-skill/update/apply`, handle.token, { confirm: true })
    expect((await apply.json()).id).toBe("acme/zip-skill")
    expect(readFileSync(join(l.storeDir, "acme/zip-skill", "SKILL.md"), "utf8")).toContain("v2")
  })

  it("requires confirm to apply and 404s unknown ids", async () => {
    const { root } = makeStore("v1")
    handle = await startUiServer({ root, uiDist: join(root, "dist"), port: 0, fetchImpl: fetchImpl("v1") })
    expect((await post(`${handle.url}api/skills/acme%2Fzip-skill/update/apply`, handle.token, {})).status).toBe(400)
    expect((await post(`${handle.url}api/skills/acme%2Fnope/install`, handle.token, { dryRun: true })).status).toBe(404)
  })
})
