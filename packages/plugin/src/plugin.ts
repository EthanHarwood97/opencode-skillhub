import type { Plugin } from "@opencode-ai/plugin"
import { join } from "node:path"
import { applyConfigToSkillHub } from "./config-hook.ts"
import { isSessionBoundary } from "./events.ts"
import { readCatalogIndex } from "./catalog-read.ts"
import { makeLoadTool, makeSpill, readSkillBodyFromDisk } from "./load-core.ts"
import { recordLoad, recordSearch, recordSuggestion, usageFileFor } from "./manage-core.ts"
import { makeQueryEmbedder } from "./query-embedder.ts"
import { makeRetrievalTransform, promptFromChatMessage, rememberPrompt, type RetrievalState } from "./retrieval-hook.ts"
import { readRetrievalSettings } from "./settings.ts"
import { resolveRoot } from "./root.ts"
import { buildRetrievalFtsQuery } from "./search-core.ts"
import { searchRuntime } from "./search-runtime.ts"
import { makeStartupNotifier, renderStatus } from "./status-core.ts"
import { makeRouterTool } from "./tools.ts"
import { collectStatus, makeCapture } from "./wiring.ts"
import { readVectors } from "../../catalog/src/vectors.ts"
import { openBrowser } from "../../cli/src/ui/open.ts"
import { resolveUiDist } from "../../cli/src/ui/paths.ts"
import { startUiServer } from "../../cli/src/ui/server.ts"
import { ensureDashboard, makeDashboardCommand, makeLazyEnsure } from "./dashboard-core.ts"

const retrievalState: RetrievalState = { prompts: new Map() }

export const SkillHubPlugin: Plugin = async ({ client, directory }) => {
  const root = resolveRoot()
  const ensure = makeLazyEnsure(() => ensureDashboard({ root, uiDist: resolveUiDist(), port: 4517, start: startUiServer }))
  const dashboardCommand = makeDashboardCommand({ ensure, open: openBrowser })
  const capture = makeCapture(process.env.SKILLHUB_CAPTURE_DIR)
  const notifier = makeStartupNotifier({
    toast: async (message, variant) => {
      await client.tui.showToast({ body: { message, variant: (variant as any) ?? "info" } }).catch(() => {})
    },
    compute: () => collectStatus(root, directory, new Date()),
  })

  let vectorsCache: Map<string, Float32Array> | undefined
  const loadVectors = (): Map<string, Float32Array> | undefined => {
    if (vectorsCache) return vectorsCache
    const loaded = readVectors(join(root, "catalog"))
    if (!loaded) return undefined
    vectorsCache = loaded.vectors
    return vectorsCache
  }

  let tagsCache: Map<string, string[]> | undefined
  const retrievalTags = (): Map<string, string[]> => {
    if (tagsCache) return tagsCache
    const index = readCatalogIndex(root)
    if (!index) return new Map()
    tagsCache = new Map(index.skills.map((skill) => [skill.id, skill.tags]))
    return tagsCache
  }

  const embed = makeQueryEmbedder({ apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY })

  const retrievalTransform = makeRetrievalTransform(
    {
      search: (query, limit) => searchRuntime(root, query, limit, { ftsQuery: buildRetrievalFtsQuery(query) }),
      embed,
      loadVectors,
      readBody: (id) => readSkillBodyFromDisk(root, id),
      tagsFor: (id) => retrievalTags().get(id) ?? [],
      settings: () => readRetrievalSettings(root),
      onSuggestion: (ids) => {
        try {
          recordSuggestion(usageFileFor(root, directory), ids, new Date())
        } catch {}
      },
      onAutoLoad: (id) => {
        try {
          recordLoad(usageFileFor(root, directory), id, new Date())
        } catch {}
      },
    },
    retrievalState,
  )

  return {
    config: async (cfg) => {
      applyConfigToSkillHub(cfg as any, { root })
    },
    tool: {
      skillhub_search: makeRouterTool({
        search: async (q, limit) => {
          const rows = await searchRuntime(root, q, limit)
          try {
            recordSearch(usageFileFor(root, directory), new Date())
          } catch {}
          return rows
        },
      }),
      skillhub_load: makeLoadTool({
        read: async (id) => readSkillBodyFromDisk(root, id),
        riskFor: async (id) => readCatalogIndex(root)?.skills.find((s) => s.id === id)?.risk.level,
        spill: makeSpill(root),
        onLoad: (id) => {
          try {
            recordLoad(usageFileFor(root, directory), id, new Date())
          } catch {}
        },
      }),
    },
    event: async ({ event }) => {
      if (isSessionBoundary(event as any)) await notifier.notifyOnce()
    },
    "command.execute.before": async (input, output) => {
      if (input.command === "skills") {
        output.parts.push({ type: "text", text: renderStatus(collectStatus(root, directory, new Date())) } as any)
      }
      if (input.command === "skillhub") {
        await dashboardCommand(output as { parts: unknown[] })
      }
    },
    "tool.execute.before": async (input) => {
      capture.toolCall?.(input.tool)
    },
    "chat.message": async (input, output) => {
      const prompt = promptFromChatMessage(input, output)
      if (prompt) rememberPrompt(retrievalState, input.sessionID, prompt)
    },
    "experimental.chat.system.transform": async (input, output) => {
      await retrievalTransform(input, output)
      capture.system?.(output.system)
    },
  }
}
