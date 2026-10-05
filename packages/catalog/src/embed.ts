export const EMBED_DIM = 1024

export type Embedder = (text: string) => Float64Array

const hash32 = (value: string): number => {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1)
  const out = [...words]
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]}_${words[i + 1]}`)
  return out
}

/** Deterministic, dependency-free hashing-trick embedding (words + bigrams), L2-normalized. */
export function embedText(text: string, dim: number = EMBED_DIM): Float64Array {
  const vector = new Float64Array(dim)
  for (const token of tokenize(text)) {
    const h = hash32(token)
    vector[h % dim] += 1
  }
  let norm = 0
  for (let i = 0; i < dim; i++) norm += vector[i]! * vector[i]!
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < dim; i++) vector[i] = vector[i]! / norm
  return vector
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}
