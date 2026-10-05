export type RetrievalMode = "off" | "suggest" | "auto"

export type RetrievalSettings = {
  mode: RetrievalMode
  embed: "gemini" | "off"
  minScore: number
  autoScore: number
  maxPointers: number
}

export const DEFAULT_RETRIEVAL: RetrievalSettings = { mode: "suggest", embed: "gemini", minScore: 0.35, autoScore: 0.55, maxPointers: 3 }

export type CandidateInput = {
  id: string
  name: string
  description: string
  tags: string[]
  risk: string
  total: number
  ftsRank: number
}

export type Candidate = CandidateInput & { score: number }

export const dot = (a: Float32Array, b: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!
  return sum
}

const tokenize = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1)

export function rankCandidates(
  prompt: string,
  rows: CandidateInput[],
  queryVector: Float32Array | undefined,
  vectors: Map<string, Float32Array> | undefined,
): Candidate[] {
  const promptTokens = new Set(tokenize(prompt))
  const maxFts = Math.max(...rows.map((row) => row.ftsRank), 0.0001)
  return rows
    .map((row) => {
      const lexical = row.ftsRank > 0 ? row.ftsRank / maxFts : 0
      const vector = queryVector ? vectors?.get(row.id) : undefined
      let score = vector ? 0.65 * Math.max(0, dot(queryVector!, vector)) + 0.35 * lexical : lexical
      if (tokenize(row.name).some((token) => promptTokens.has(token))) score += 0.05
      if (row.tags.some((tag) => promptTokens.has(tag.toLowerCase()))) score += 0.03
      return { ...row, score: Math.min(1, Math.round(score * 1000) / 1000) }
    })
    .sort((a, b) => b.score - a.score || b.total - a.total || a.id.localeCompare(b.id))
}

export function selectCandidates(candidates: Candidate[], settings: RetrievalSettings): Candidate[] {
  return candidates.filter((candidate) => candidate.score >= settings.minScore).slice(0, settings.maxPointers)
}

const describeCandidate = (candidate: Candidate): string => {
  const description = candidate.description.length > 100 ? `${candidate.description.slice(0, 100).trimEnd()}…` : candidate.description
  return `- ${candidate.id} — ${candidate.name} (match ${candidate.score.toFixed(2)}, risk ${candidate.risk}): ${description}`
}

export function formatRetrievalBlock(candidates: Candidate[]): string | undefined {
  if (candidates.length === 0) return undefined
  return [
    "<skillhub-retrieval>",
    "Library skills that may help with this request (from the local SkillHub catalog):",
    ...candidates.map(describeCandidate),
    "Load one with skillhub_load(id) if it helps; ignore otherwise.",
    "</skillhub-retrieval>",
  ].join("\n")
}

export function pickAutoBody(candidates: Candidate[], settings: RetrievalSettings): Candidate | undefined {
  if (settings.mode !== "auto") return undefined
  const top = candidates[0]
  return top && top.score >= settings.autoScore ? top : undefined
}
