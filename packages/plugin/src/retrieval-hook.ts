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

export type RetrievalState = { prompts: Map<string, string>; recorded: Map<string, string>; last?: string }

export const PROMPT_STATE_LIMIT = 20

function evictOldest(map: Map<string, string>): void {
  while (map.size > PROMPT_STATE_LIMIT) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

/** Remember the latest prompt per session, replacing the previous one and evicting the oldest entry beyond the cap. */
export function rememberPrompt(state: RetrievalState, sessionID: string, prompt: string): void {
  state.prompts.set(sessionID, prompt)
  state.recorded.delete(sessionID)
  state.last = prompt
  evictOldest(state.prompts)
  evictOldest(state.recorded)
}

/**
 * Append the retrieval block to each request of the current turn. The prompt is
 * not consumed: it stays pending for the whole turn (title, main, tool-loop
 * requests) and is replaced when the next user message reaches rememberPrompt.
 * The suggestion is recorded once per user message, not once per request.
 */
export function makeRetrievalTransform(deps: RetrievalDeps, state: RetrievalState) {
  return async (input: { sessionID?: string }, output: { system: string[] }): Promise<void> => {
    const sessionID = input.sessionID
    const sessionPrompt = sessionID ? state.prompts.get(sessionID) : undefined
    const prompt = sessionPrompt ?? state.last
    if (!prompt || prompt.trim() === "") return
    try {
      const settings = deps.settings()
      if (settings.mode === "off") return
      let queryVector: Float32Array | undefined
      if (settings.embed === "gemini") {
        try {
          queryVector = await deps.embed(prompt)
        } catch {
          queryVector = undefined
        }
      }
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
      let autoLoaded: string | undefined
      const auto = pickAutoBody(candidates, settings)
      if (auto) {
        const body = deps.readBody(auto.id)
        if (body) {
          text += `\n\n[auto-loaded ${auto.id}]\n${body.slice(0, 8000)}`
          deps.onAutoLoad(auto.id)
          autoLoaded = auto.id
        }
      }
      output.system.push(text)
      const sessionKey = sessionID ?? ""
      if (state.recorded.get(sessionKey) !== prompt) {
        deps.onSuggestion(
          candidates.map((candidate) => candidate.id),
          autoLoaded,
        )
        state.recorded.set(sessionKey, prompt)
        evictOldest(state.recorded)
      }
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
