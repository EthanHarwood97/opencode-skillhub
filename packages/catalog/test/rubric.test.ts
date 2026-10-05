import { describe, expect, it } from "vitest"
import type { LlmClient } from "../src/llm.ts"
import { buildRubricMessages, MAX_BODY_CHARS, makeRubricEvaluator, parseRubricResponse, RUBRIC_INSTRUCTIONS, RUBRIC_VERSION } from "../src/rubric.ts"

const valid = {
  score: 82,
  dimensions: { triggers: 80, clarity: 85, structure: 80, completeness: 75, scope: 90, examples: 85, safety: 95 },
  reasoning: "Clear trigger phrasing and a usable workflow.",
  flags: ["no-examples-for-edge-cases"],
}

describe("buildRubricMessages", () => {
  it("includes the skill and truncates oversized bodies", () => {
    const messages = buildRubricMessages({ id: "a/x", name: "x", description: "d", body: "y".repeat(MAX_BODY_CHARS + 500) })
    expect(messages).toHaveLength(2)
    expect(messages[1]!.content.length).toBeLessThan(MAX_BODY_CHARS + 1_000)
    expect(messages[1]!.content).toContain("[truncated]")
  })

  it("wraps the body as untrusted skill content", () => {
    const messages = buildRubricMessages({ id: "a/x", name: "x", description: "d", body: "# Instructions" })
    expect(messages[1]!.content).toContain("<skill-content>")
    expect(messages[1]!.content).toContain("</skill-content>")
    expect(RUBRIC_INSTRUCTIONS).toContain("untrusted")
  })
})

describe("parseRubricResponse", () => {
  it("parses plain JSON", () => {
    expect(parseRubricResponse(JSON.stringify(valid)).score).toBe(82)
  })
  it("strips markdown fences", () => {
    expect(parseRubricResponse("```json\n" + JSON.stringify(valid) + "\n```").reasoning).toMatch(/trigger/i)
  })
  it("rejects out-of-range scores", () => {
    expect(() => parseRubricResponse(JSON.stringify({ ...valid, score: 140 }))).toThrow(/invalid rubric response/)
  })
})

describe("makeRubricEvaluator", () => {
  it("returns result, usage, model and cost", async () => {
    const client: LlmClient = {
      complete: async () => ({ text: "```json\n" + JSON.stringify(valid) + "\n```", usage: { inputTokens: 8_000, outputTokens: 400 }, model: "deepseek-chat" }),
    }
    const evaluate = makeRubricEvaluator(client, { inputPerMTok: 0.3, outputPerMTok: 1 })
    const out = await evaluate({ id: "a/x", name: "x", description: "d", body: "# X" })
    expect(out.result.score).toBe(82)
    expect(out.model).toBe("deepseek-chat")
    expect(out.costUsd).toBeCloseTo(0.0028, 6)
  })
  it("exports a versioned rubric id", () => {
    expect(RUBRIC_VERSION).toBe("rubric-v1")
  })
})
