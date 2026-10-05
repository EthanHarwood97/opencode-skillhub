import type { Plugin } from "@opencode-ai/plugin"
import { resolveRoot } from "./root.ts"
import { searchRuntime } from "./search-runtime.ts"
import { makeRouterTool } from "./tools.ts"

export const SkillHubPlugin: Plugin = async () => {
  const root = resolveRoot()
  return {
    tool: {
      skillhub_search: makeRouterTool({ search: (q, limit) => searchRuntime(root, q, limit) }),
    },
  }
}
