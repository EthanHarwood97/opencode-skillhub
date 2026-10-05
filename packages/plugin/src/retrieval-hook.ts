import { formatRetrievalBlock, pickAutoBody, rankCandidates, selectCandidates, type CandidateInput, type RetrievalSettings } from "./retrieval-core.ts"

export type RetrievalSearchRow = {
  id: string
  name: string
  description: string
  category: string
  risk: string
  total: number
  rank?: number
}

export type RetrievalDeps = {
  search: (query: string, limit: number) => Promise<RetrievalSearchRow[]>
  embed: (text: string) => Promise<Float32Array | undefined>
  loadVectors: () => Map<string, Float32Array> | undefined
  readBody: (id: string) => string | undefined
  tagsFor: (id: string) => string[]
  settings: () => RetrievalSettings
  onSuggestion: (ids: string[], autoLoaded?: string) => void
  onAutoLoad: (id: string) => void
}

export function makeRetrievalTransform(deps: RetrievalDeps, state: { prompt?: string }) {
  return async (_input: unknown, output: { system: string[] }): Promise<void> => {
    const prompt = state.prompt
    state.prompt = undefined
    if (!prompt || prompt.trim() === "") return
    try {
      const settings = deps.settings()
      if (settings.mode === "off") return
      const queryVector = settings.embed === "gemini" ? await deps.embed(prompt) : undefined
      const rows = await deps.search(prompt, 10)
      if (rows.length === 0) return
      const inputs: CandidateInput[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        tags: deps.tagsFor(row.id),
        risk: row.risk,
        total: row.total,
        ftsRank: Number.isFinite(row.rank) && (row.rank ?? 0) > 0 ? (row.rank as number) : 0,
      }))
      const candidates = selectCandidates(rankCandidates(prompt, inputs, queryVector, deps.loadVectors()), settings)
      const block = formatRetrievalBlock(candidates)
      if (!block) return
      let text = block
      const auto = pickAutoBody(candidates, settings)
      if (auto) {
        const body = deps.readBody(auto.id)
        if (body) {
          text += `\n\n[auto-loaded ${auto.id}]\n${body.slice(0, 8000)}`
          deps.onAutoLoad(auto.id)
        }
      }
      output.system.push(text)
      deps.onSuggestion(
        candidates.map((candidate) => candidate.id),
        auto?.id,
      )
    } catch {
      // fail-open: retrieval must never block a turn
    }
  }
}

/** Best-effort extraction of the latest user text from a chat.message payload. */
export function promptFromChatMessage(input: unknown, output: unknown): string | undefined {
  const candidate = output as { message?: { parts?: unknown[] }; parts?: unknown[] } | undefined
  const parts = candidate?.parts ?? candidate?.message?.parts ?? (input as { message?: { parts?: unknown[] } })?.message?.parts
  if (!Array.isArray(parts)) return undefined
  const texts = parts.flatMap((part) => {
    const p = part as { type?: string; text?: string }
    return p?.type === "text" && typeof p.text === "string" ? [p.text] : []
  })
  return texts.join("\n").trim() || undefined
}
