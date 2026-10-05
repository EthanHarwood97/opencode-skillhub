import { describe, expect, it } from "vitest"
import { DEFAULT_RETRIEVAL } from "../src/retrieval-core.ts"
import { makeRetrievalTransform, promptFromChatMessage, rememberPrompt, type RetrievalState } from "../src/retrieval-hook.ts"

const deps = (over: Partial<Parameters<typeof makeRetrievalTransform>[0]> = {}) => ({
  search: async () => [
    { id: "weizhena-deep-research-skills/research", name: "research", description: "deep web research", category: "research", risk: "low", total: 78, rank: 2 },
  ],
  embed: async () => Float32Array.from([1, 0, 0]),
  loadVectors: () =>
    new Map([["weizhena-deep-research-skills/research", Float32Array.from([1, 0, 0])]]) as Map<string, Float32Array>,
  readBody: () => "# Research\nsteps",
  tagsFor: () => ["research"],
  settings: () => DEFAULT_RETRIEVAL,
  onSuggestion: () => {},
  onAutoLoad: () => {},
  ...over,
})

const stateWith = (sessionID: string, prompt: string): RetrievalState => {
  const state: RetrievalState = { prompts: new Map() }
  rememberPrompt(state, sessionID, prompt)
  return state
}

describe("makeRetrievalTransform", () => {
  it("appends a retrieval block for a matching prompt and consumes the prompt", async () => {
    const state = stateWith("s1", "I need deep web research for a report")
    const output = { system: ["base"] as string[] }
    const suggestions: string[][] = []
    await makeRetrievalTransform(deps({ onSuggestion: (ids) => void suggestions.push(ids) }), state)({ sessionID: "s1" }, output)
    expect(state.prompts.size).toBe(0)
    expect(state.last).toBeUndefined()
    expect(output.system).toHaveLength(2)
    expect(output.system[1]).toContain("<skillhub-retrieval>")
    expect(output.system[1]).toContain("weizhena-deep-research-skills/research")
    expect(suggestions).toEqual([["weizhena-deep-research-skills/research"]])
  })

  it("keeps session prompts isolated when two sessions interleave", async () => {
    const state: RetrievalState = { prompts: new Map() }
    rememberPrompt(state, "s1", "deep research alpha")
    rememberPrompt(state, "s2", "deep research beta")
    const rowsFor = (query: string) => [
      query.includes("alpha")
        ? { id: "acme/alpha", name: "alpha", description: "alpha work", category: "research", risk: "low", total: 60, rank: 2 }
        : { id: "acme/beta", name: "beta", description: "beta work", category: "research", risk: "low", total: 60, rank: 2 },
    ]
    const transform = makeRetrievalTransform(deps({ search: async (query) => rowsFor(query) }), state)
    const first = { system: ["base"] as string[] }
    await transform({ sessionID: "s1" }, first)
    expect(first.system[1]).toContain("acme/alpha")
    const second = { system: ["base"] as string[] }
    await transform({ sessionID: "s2" }, second)
    expect(second.system[1]).toContain("acme/beta")
    expect(first.system[1]).not.toContain("acme/beta")
    expect(state.prompts.size).toBe(0)
    expect(state.last).toBeUndefined()
  })

  it("does nothing when the mode is off, the prompt is empty, or nothing matches", async () => {
    const cases: { state: RetrievalState; d: Parameters<typeof makeRetrievalTransform>[0] }[] = [
      { state: stateWith("s1", "x"), d: deps({ settings: () => ({ ...DEFAULT_RETRIEVAL, mode: "off" as const }) }) },
      { state: { prompts: new Map() }, d: deps() },
      { state: stateWith("s1", "x"), d: deps({ search: async () => [] }) },
    ]
    for (const entry of cases) {
      const output = { system: ["base"] as string[] }
      await makeRetrievalTransform(entry.d, entry.state)({ sessionID: "s1" }, output)
      expect(output.system).toHaveLength(1)
    }
  })

  it("falls back to the lexical match when the embedder throws", async () => {
    const failing = deps({
      embed: async () => {
        throw new Error("down")
      },
    })
    const output = { system: ["base"] as string[] }
    await makeRetrievalTransform(failing, stateWith("s1", "x"))({ sessionID: "s1" }, output)
    expect(output.system).toHaveLength(2)
    expect(output.system[1]).toContain("<skillhub-retrieval>")
    expect(output.system[1]).toContain("weizhena-deep-research-skills/research")
  })

  it("fails open when the deps throw", async () => {
    const failing = deps({
      search: async () => {
        throw new Error("down")
      },
    })
    const output = { system: ["base"] as string[] }
    await makeRetrievalTransform(failing, stateWith("s1", "x"))({ sessionID: "s1" }, output)
    expect(output.system).toHaveLength(1)
  })

  it("sanitizes a missing or non-finite rank instead of disabling suggestions", async () => {
    for (const rank of [undefined, Number.NaN]) {
      const row = { id: "weizhena-deep-research-skills/research", name: "research", description: "deep web research", category: "research", risk: "low", total: 78, rank }
      const output = { system: ["base"] as string[] }
      const suggestions: string[][] = []
      await makeRetrievalTransform(deps({ search: async () => [row], onSuggestion: (ids) => void suggestions.push(ids) }), {
        prompts: new Map([["s1", "I need deep web research for a report"]]),
      })({ sessionID: "s1" }, output)
      expect(output.system).toHaveLength(2)
      expect(suggestions).toEqual([["weizhena-deep-research-skills/research"]])
    }
  })

  it("auto mode appends one body and records it", async () => {
    const loaded: string[] = []
    const d = deps({ settings: () => ({ ...DEFAULT_RETRIEVAL, mode: "auto" as const, minScore: 0 }), onAutoLoad: (id) => void loaded.push(id) })
    const output = { system: ["base"] as string[] }
    await makeRetrievalTransform(d, stateWith("s1", "research please"))({ sessionID: "s1" }, output)
    expect(output.system[1]).toContain("[auto-loaded")
    expect(output.system[1]).toContain("# Research")
    expect(loaded).toEqual(["weizhena-deep-research-skills/research"])
  })

  it("caps the auto body at 8000 characters", async () => {
    const d = deps({
      settings: () => ({ ...DEFAULT_RETRIEVAL, mode: "auto" as const, minScore: 0 }),
      readBody: () => "x".repeat(9000),
    })
    const output = { system: ["base"] as string[] }
    await makeRetrievalTransform(d, stateWith("s1", "research please"))({ sessionID: "s1" }, output)
    expect(output.system[1]).toContain("[auto-loaded")
    expect(output.system[1]).toContain("x".repeat(8000))
    expect(output.system[1]).not.toContain("x".repeat(8001))
  })

  it("reports the auto id only when a body was actually appended", async () => {
    const calls: { ids: string[]; auto?: string }[] = []
    const d = deps({
      settings: () => ({ ...DEFAULT_RETRIEVAL, mode: "auto" as const, minScore: 0 }),
      readBody: () => undefined,
      onSuggestion: (ids, auto) => void calls.push({ ids, auto }),
    })
    const output = { system: ["base"] as string[] }
    await makeRetrievalTransform(d, stateWith("s1", "research please"))({ sessionID: "s1" }, output)
    expect(output.system[1]).not.toContain("[auto-loaded")
    expect(calls).toEqual([{ ids: ["weizhena-deep-research-skills/research"], auto: undefined }])
  })
})

describe("rememberPrompt", () => {
  it("bounds the map, evicting the oldest session", () => {
    const state: RetrievalState = { prompts: new Map() }
    for (let i = 0; i < 21; i++) rememberPrompt(state, `s${i}`, `prompt ${i}`)
    expect(state.prompts.size).toBe(20)
    expect(state.prompts.has("s0")).toBe(false)
    expect(state.prompts.has("s20")).toBe(true)
    expect(state.last).toBe("prompt 20")
  })
})

describe("promptFromChatMessage", () => {
  it("reads the text parts from output.parts first", () => {
    const parts = [
      { type: "text", text: "hello" },
      { type: "reasoning", text: "not a prompt" },
      { type: "text", text: "world" },
    ]
    expect(promptFromChatMessage({}, { message: { id: "m1" }, parts })).toBe("hello\nworld")
  })

  it("keeps the message.parts fallbacks harmless", () => {
    expect(promptFromChatMessage({}, { message: { parts: [{ type: "text", text: "from message" }] } })).toBe("from message")
    expect(promptFromChatMessage({ message: { parts: [{ type: "text", text: "from input" }] } }, {})).toBe("from input")
  })

  it("returns undefined when there is no usable text", () => {
    expect(promptFromChatMessage({}, {})).toBeUndefined()
    expect(promptFromChatMessage({}, { parts: [] })).toBeUndefined()
    expect(promptFromChatMessage({}, { parts: [{ type: "file", url: "x" }] })).toBeUndefined()
    expect(promptFromChatMessage({}, { parts: [{ type: "text", text: "   " }] })).toBeUndefined()
  })
})
