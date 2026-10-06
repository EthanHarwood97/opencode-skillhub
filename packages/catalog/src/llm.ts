export type ChatMessage = { role: "system" | "user"; content: string }
export type LlmUsage = { inputTokens: number; outputTokens: number }
export type LlmResult = { text: string; usage: LlmUsage; model: string }
export type LlmClient = { complete: (messages: ChatMessage[]) => Promise<LlmResult> }

export class LlmError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

export type LlmPricing = { inputPerMTok: number; outputPerMTok: number }
export const DEFAULT_PRICING: LlmPricing = { inputPerMTok: 0.3, outputPerMTok: 1.0 }

export function estimateCostUsd(usage: LlmUsage, pricing: LlmPricing = DEFAULT_PRICING): number {
  return (usage.inputTokens / 1_000_000) * pricing.inputPerMTok + (usage.outputTokens / 1_000_000) * pricing.outputPerMTok
}

const retryable = (status: number) => status === 429 || status >= 500

export function makeOpenAiCompatClient(opts: {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  temperature?: number
}): LlmClient {
  const fetchImpl = opts.fetchImpl ?? fetch
  const base = opts.baseUrl.replace(/\/+$/, "")
  return {
    async complete(messages) {
      const payload = JSON.stringify({
        model: opts.model,
        messages,
        temperature: opts.temperature ?? 0,
        response_format: { type: "json_object" },
      })
      let lastStatus: number | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetchImpl(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${opts.apiKey}`,
          },
          body: payload,
          signal: AbortSignal.timeout(90_000),
        })
        if (res.ok) {
          const json = (await res.json()) as {
            choices?: { message?: { content?: string } }[]
            usage?: { prompt_tokens?: number; completion_tokens?: number }
            model?: string
          }
          const text = json.choices?.[0]?.message?.content
          if (typeof text !== "string" || text.length === 0) throw new LlmError("empty completion")
          return {
            text,
            usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
            model: json.model ?? opts.model,
          }
        }
        lastStatus = res.status
        if (!retryable(res.status)) break
      }
      throw new LlmError(`llm request failed (status ${lastStatus})`, lastStatus)
    },
  }
}
