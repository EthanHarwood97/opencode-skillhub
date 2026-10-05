import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_RETRIEVAL } from "../src/retrieval-core.ts"
import { readRetrievalSettings } from "../src/settings.ts"

const rootWith = (body: unknown) => {
  const root = mkdtempSync(join(tmpdir(), "skillhub-settings-"))
  if (body !== undefined) writeFileSync(join(root, "settings.json"), JSON.stringify(body))
  return root
}

describe("readRetrievalSettings", () => {
  it("defaults when the file is missing or malformed", () => {
    expect(readRetrievalSettings(rootWith(undefined))).toEqual(DEFAULT_RETRIEVAL)
    expect(readRetrievalSettings(rootWith("{ not json"))).toEqual(DEFAULT_RETRIEVAL)
  })

  it("merges valid partial settings and validates fields", () => {
    const settings = readRetrievalSettings(rootWith({ retrieval: { mode: "auto", embed: "off", minScore: 0.9, maxPointers: 3 } }))
    expect(settings).toEqual({ mode: "auto", embed: "off", minScore: 0.9, autoScore: DEFAULT_RETRIEVAL.autoScore, maxPointers: 3 })
    expect(readRetrievalSettings(rootWith({ retrieval: { mode: "wild", minScore: 12, maxPointers: 0 } }))).toEqual(DEFAULT_RETRIEVAL)
  })

  it("honours the env override", () => {
    const root = rootWith({ retrieval: { mode: "suggest" } })
    expect(readRetrievalSettings(root, { SKILLHUB_RETRIEVAL: "off" }).mode).toBe("off")
  })
})
