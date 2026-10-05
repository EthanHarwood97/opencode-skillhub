import type { Plugin } from "@opencode-ai/plugin"
import { applyConfigToSkillHub } from "./config-hook.ts"
import { isSessionBoundary } from "./events.ts"
import { readCatalogIndex } from "./catalog-read.ts"
import { makeLoadTool, readSkillBodyFromDisk } from "./load-core.ts"
import { recordSearch, usageFileFor, readUsage } from "./manage-core.ts"
import { resolveRoot } from "./root.ts"
import { searchRuntime } from "./search-runtime.ts"
import { makeStartupNotifier, renderStatus } from "./status-core.ts"
import { makeRouterTool } from "./tools.ts"
import { collectStatus, makeCapture } from "./wiring.ts"

export const SkillHubPlugin: Plugin = async ({ client, directory }) => {
  const root = resolveRoot()
  const capture = makeCapture(process.env.SKILLHUB_CAPTURE_DIR)
  const notifier = makeStartupNotifier({
    toast: async (message, variant) => {
      await client.tui.showToast({ body: { message, variant: (variant as any) ?? "info" } }).catch(() => {})
    },
    compute: () => collectStatus(root, directory, new Date()),
  })

  return {
    config: async (cfg) => {
      applyConfigToSkillHub(cfg as any, { root })
    },
    tool: {
      skillhub_search: makeRouterTool({
        search: async (q, limit) => {
          const usageFile = usageFileFor(root, directory)
          recordSearch(usageFile, new Date())
          return searchRuntime(root, q, limit)
        },
      }),
      skillhub_load: makeLoadTool({
        read: async (id) => readSkillBodyFromDisk(root, id),
        riskFor: async (id) => readCatalogIndex(root)?.skills.find((s) => s.id === id)?.risk.level,
      }),
    },
    event: async ({ event }) => {
      if (isSessionBoundary(event as any)) await notifier.notifyOnce()
    },
    "command.execute.before": async (input, output) => {
      if (input.command === "skills") {
        output.parts.push({ type: "text", text: renderStatus(collectStatus(root, directory, new Date())) } as any)
      }
    },
    "tool.execute.before": async (input) => {
      capture.toolCall?.(input.tool)
    },
    "experimental.chat.system.transform": async (_input, output) => {
      capture.system?.(output.system)
    },
  }
}
