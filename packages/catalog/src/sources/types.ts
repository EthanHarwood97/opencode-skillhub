import type { Signals, Source } from "../types.ts"

export type FetchLike = (
  url: string,
) => Promise<{
  ok: boolean
  status: number
  headers?: { get(name: string): string | null }
  arrayBuffer(): Promise<ArrayBuffer>
  json(): Promise<unknown>
}>

export type CandidateFile = { path: string; sha256?: string; size?: number; content?: string; bytes?: Uint8Array }

export type Candidate = {
  source: Source
  name: string
  dir: string
  description?: string
  tags: string[]
  files: CandidateFile[]
  signals: Partial<Signals>
  categoryHint?: string
}
