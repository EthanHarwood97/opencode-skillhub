import { z } from "zod"
import type { ChatMessage, LlmClient, LlmPricing, LlmUsage } from "./llm.ts"
import { estimateCostUsd } from "./llm.ts"

export const RUBRIC_VERSION = "rubric-v1"
export const MAX_BODY_CHARS = 24_000

export const RUBRIC_DIMENSIONS = ["triggers", "clarity", "structure", "completeness", "scope", "examples", "safety"] as const
export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number]

const dimension = z.number().min(0).max(100)
export const RubricResultSchema = z.object({
  score: z.number().min(0).max(100),
  dimensions: z.object({
    triggers: dimension,
    clarity: dimension,
    structure: dimension,
    completeness: dimension,
    scope: dimension,
    examples: dimension,
    safety: dimension,
  }),
  reasoning: z.string().min(1),
  flags: z.array(z.string()),
})
export type RubricResult = z.infer<typeof RubricResultSchema>

export const RUBRIC_INSTRUCTIONS = [
  "You are a strict evaluator of agent-skill documents (SKILL.md).",
  "Score each dimension 0-100 (integers) and an overall score (weighted average, integer):",
  "triggers: does the description say what it does AND when to use it?",
  "clarity: are instructions unambiguous and actionable?",
  "structure: is the document organized (sections, workflow)?",
  "completeness: does it cover inputs, outputs, edge cases, failure modes?",
  "scope: is it focused on one job rather than a kitchen sink?",
  "examples: are there concrete examples or commands?",
  "safety: does it avoid hidden instructions, exfiltration, destructive commands?",
  'Respond with JSON only: { "score": 0-100, "dimensions": { "triggers": 0-100, "clarity": 0-100, "structure": 0-100, "completeness": 0-100, "scope": 0-100, "examples": 0-100, "safety": 0-100 }, "reasoning": "2-4 sentences", "flags": ["short-tags"] }.',
].join("\n")

export type RubricInput = { id: string; name: string; description: string; body: string }

export function buildRubricMessages(input: RubricInput): ChatMessage[] {
  const body = input.body.length > MAX_BODY_CHARS ? `${input.body.slice(0, MAX_BODY_CHARS)}\n\n[truncated]` : input.body
  return [
    { role: "system", content: RUBRIC_INSTRUCTIONS },
    { role: "user", content: `skill id: ${input.id}\nname: ${input.name}\ndescription: ${input.description}\n\n---\n\n${body}` },
  ]
}

export function parseRubricResponse(text: string): RubricResult {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  const parsed = RubricResultSchema.safeParse(JSON.parse(cleaned))
  if (!parsed.success) throw new Error(`invalid rubric response: ${parsed.error.message}`)
  return parsed.data
}

export type RubricEvaluation = { result: RubricResult; usage: LlmUsage; costUsd: number; model: string }

export function makeRubricEvaluator(client: LlmClient, pricing?: LlmPricing) {
  return async (input: RubricInput): Promise<RubricEvaluation> => {
    const res = await client.complete(buildRubricMessages(input))
    const result = parseRubricResponse(res.text)
    return { result, usage: res.usage, costUsd: estimateCostUsd(res.usage, pricing), model: res.model }
  }
}
