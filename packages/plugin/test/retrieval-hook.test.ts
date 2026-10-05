import { describe, expect, it } from "vitest"
import { DEFAULT_RETRIEVAL } from "../src/retrieval-core.ts"
import { makeRetrievalTransform, promptFromChatMessage } from "../src/retrieval-hook.ts"

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

describe("makeRetrievalTransform", () => {
  it("appends a retrieval block for a matching prompt and consumes the prompt", async () => {
    const state = { prompt: "I need deep web research for a report" }
    const output = { system: ["base"] as string[] }
    const suggestions: string[][] = []
    await makeRetrievalTransform(deps({ onSuggestion: (ids) => void suggestions.push(ids) }), state)({}, output)
    expect(state.prompt).toBeUndefined()
    expect(output.system).toHaveLength(2)
    expect(output.system[1]).toContain("<skillhub-retrieval>")
    expect(output.system[1]).toContain("weizhena-deep-research-skills/research")
    expect(suggestions).toEqual([["weizhena-deep-research-skills/research"]])
  })

  it("does nothing when the mode is off, the prompt is empty, or nothing matches", async () => {
    for (const [state, d] of [
      [{ prompt: "x" }, deps({ settings: () => ({ ...DEFAULT_RETRIEVAL, mode: "off" as const }) })],
      [{}, deps()],
      [{ prompt: "x" }, deps({ search: async () => [] })],
    ] as const) {
      const output = { system: ["base"] as string[] }
      await makeRetrievalTransform(d as never, state as never)({}, output)
      expect(output.system).toHaveLength(1)
    }
  })

  it("fails open when the embedder or the deps throw", async () => {
    const failing = deps({
      embed: async () => {
        throw new Error("down")
      },
      search: async () => {
        throw new Error("down")
      },
    })
    const output = { system: ["base"] as string[] }
    await makeRetrievalTransform(failing, { prompt: "x" })({}, output)
    expect(output.system).toHaveLength(1)
  })

  it("sanitizes a missing or non-finite rank instead of disabling suggestions", async () => {
    for (const rank of [undefined, Number.NaN]) {
      const row = { id: "weizhena-deep-research-skills/research", name: "research", description: "deep web research", category: "research", risk: "low", total: 78, rank }
      const output = { system: ["base"] as string[] }
      const suggestions: string[][] = []
      await makeRetrievalTransform(deps({ search: async () => [row], onSuggestion: (ids) => void suggestions.push(ids) }), {
        prompt: "I need deep web research for a report",
      })({}, output)
      expect(output.system).toHaveLength(2)
      expect(suggestions).toEqual([["weizhena-deep-research-skills/research"]])
    }
  })

  it("auto mode appends one body and records it", async () => {
    const loaded: string[] = []
    const d = deps({ settings: () => ({ ...DEFAULT_RETRIEVAL, mode: "auto" as const, minScore: 0 }), onAutoLoad: (id) => void loaded.push(id) })
    const output = { system: ["base"] as string[] }
    await makeRetrievalTransform(d, { prompt: "research please" })({}, output)
    expect(output.system[1]).toContain("[auto-loaded")
    expect(output.system[1]).toContain("# Research")
    expect(loaded).toEqual(["weizhena-deep-research-skills/research"])
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
