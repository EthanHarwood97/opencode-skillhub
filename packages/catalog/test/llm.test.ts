import { describe, expect, it } from "vitest"
import { estimateCostUsd, LlmError, makeOpenAiCompatClient } from "../src/llm.ts"

const completion = (text: string, input = 100, output = 20, model = "test-model") =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: input, completion_tokens: output }, model }), { status: 200 })

describe("makeOpenAiCompatClient", () => {
  it("posts chat completions and returns text, usage, model", async () => {
    let seenUrl = ""
    let seenAuth = ""
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      seenUrl = String(url)
      seenAuth = String((init?.headers as Record<string, string>)?.authorization ?? "")
      return completion('{"ok":true}', 120, 30, "deepseek-chat")
    }) as unknown as typeof fetch
    const client = makeOpenAiCompatClient({ baseUrl: "https://api.example/v1/", apiKey: "k", model: "deepseek-chat", fetchImpl })
    const res = await client.complete([{ role: "user", content: "hi" }])
    expect(seenUrl).toBe("https://api.example/v1/chat/completions")
    expect(seenAuth).toBe("Bearer k")
    expect(res.text).toBe('{"ok":true}')
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 30 })
    expect(res.model).toBe("deepseek-chat")
  })

  it("retries once on 500 then succeeds", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      if (calls === 1) return new Response("boom", { status: 500 })
      return completion("ok")
    }) as unknown as typeof fetch
    const client = makeOpenAiCompatClient({ baseUrl: "https://api.example/v1", apiKey: "k", model: "m", fetchImpl })
    await expect(client.complete([{ role: "user", content: "hi" }])).resolves.toMatchObject({ text: "ok" })
    expect(calls).toBe(2)
  })

  it("does not retry 401 and throws LlmError", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response("nope", { status: 401 })
    }) as unknown as typeof fetch
    const client = makeOpenAiCompatClient({ baseUrl: "https://api.example/v1", apiKey: "bad", model: "m", fetchImpl })
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(LlmError)
    expect(calls).toBe(1)
  })
})

describe("estimateCostUsd", () => {
  it("prices input and output tokens per million", () => {
    expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 0 }, { inputPerMTok: 0.3, outputPerMTok: 1 })).toBeCloseTo(0.3, 10)
    expect(estimateCostUsd({ inputTokens: 0, outputTokens: 2_000_000 }, { inputPerMTok: 0.3, outputPerMTok: 1 })).toBeCloseTo(2, 10)
  })
})
