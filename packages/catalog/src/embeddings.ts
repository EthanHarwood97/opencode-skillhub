export type EmbeddingProvider = {
  name: string
  model: string
  dim: number
  embed: (texts: string[]) => Promise<Float32Array[]>
}

export class EmbeddingError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

const retryable = (status: number) => status === 429 || status >= 500

const normalize = (vector: Float32Array): Float32Array => {
  let norm = 0
  for (let i = 0; i < vector.length; i++) norm += vector[i]! * vector[i]!
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < vector.length; i++) vector[i] = vector[i]! / norm
  return vector
}

export function makeGeminiEmbedder(opts: {
  apiKey: string
  model?: string
  dim?: number
  fetchImpl?: typeof fetch
  batchSize?: number
}): EmbeddingProvider {
  const model = opts.model ?? "gemini-embedding-001"
  const dim = opts.dim ?? 768
  const fetchImpl = opts.fetchImpl ?? fetch
  const batchSize = Math.min(opts.batchSize ?? 50, 50)
  const base = "https://generativelanguage.googleapis.com/v1beta"

  const embedBatch = async (texts: string[]): Promise<Float32Array[]> => {
    const body = JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        outputDimensionality: dim,
      })),
    })
    let lastStatus: number | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetchImpl(`${base}/models/${model}:batchEmbedContents?key=${encodeURIComponent(opts.apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
      if (res.ok) {
        const json = (await res.json()) as { embeddings?: { values?: number[] }[] }
        const rows = json.embeddings ?? []
        if (rows.length !== texts.length) throw new EmbeddingError(`expected ${texts.length} embeddings, got ${rows.length}`)
        return rows.map((row) => normalize(Float32Array.from(row.values ?? [])))
      }
      lastStatus = res.status
      if (!retryable(res.status)) break
    }
    throw new EmbeddingError(`embedding request failed (status ${lastStatus})`, lastStatus)
  }

  return {
    name: "gemini",
    model,
    dim,
    embed: async (texts) => {
      const out: Float32Array[] = []
      for (let i = 0; i < texts.length; i += batchSize) out.push(...(await embedBatch(texts.slice(i, i + batchSize))))
      return out
    },
  }
}
