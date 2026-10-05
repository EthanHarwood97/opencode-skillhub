import { makeGeminiEmbedder } from "../../catalog/src/embeddings.ts"

export type QueryEmbedder = (text: string) => Promise<Float32Array | undefined>

export function makeQueryEmbedder(opts: {
  apiKey: string | undefined
  model?: string
  dim?: number
  fetchImpl?: typeof fetch
  cacheSize?: number
  timeoutMs?: number
}): QueryEmbedder {
  const provider = opts.apiKey
    ? makeGeminiEmbedder({ apiKey: opts.apiKey, model: opts.model, dim: opts.dim, fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs ?? 4_000 })
    : undefined
  const cache = new Map<string, Float32Array>()
  const cacheSize = opts.cacheSize ?? 50
  return async (text) => {
    if (!provider) return undefined
    const hit = cache.get(text)
    if (hit) return hit
    try {
      const [vector] = await provider.embed([text])
      if (!vector) return undefined
      if (cache.size >= cacheSize) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(text, vector)
      return vector
    } catch {
      return undefined
    }
  }
}
