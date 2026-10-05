import { tool } from "@opencode-ai/plugin"
import type { SearchRow } from "./search-core.ts"
import { formatHits, ROUTER_DESCRIPTION } from "./search-core.ts"

export type RouterDeps = { search: (query: string, limit?: number) => Promise<SearchRow[]> }

export function makeRouterTool(deps: RouterDeps) {
  return tool({
    description: ROUTER_DESCRIPTION,
    args: { query: tool.schema.string() },
    async execute(args: { query: string }) {
      if (args.query.trim() === "") return "No matching skills."
      const rows = await deps.search(args.query, 5)
      return formatHits(rows)
    },
  })
}
