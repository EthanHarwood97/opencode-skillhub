export type EnsureDashboardResult = { url: string; started: boolean } | { error: string }

export type EnsureDashboardOptions = {
  root: string
  uiDist: string | undefined
  port: number
  start: (opts: { root: string; uiDist: string; port: number }) => Promise<{ url: string }>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const probe = async (fetchImpl: typeof fetch, port: number, timeoutMs: number): Promise<boolean> => {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

/** Reuse a healthy local dashboard, otherwise start it. */
export async function ensureDashboard(opts: EnsureDashboardOptions): Promise<EnsureDashboardResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 800
  if (await probe(fetchImpl, opts.port, timeoutMs)) {
    return { url: `http://127.0.0.1:${opts.port}/`, started: false }
  }
  if (!opts.uiDist) return { error: 'UI is not built — run "npm run ui:build" first' }
  try {
    const server = await opts.start({ root: opts.root, uiDist: opts.uiDist, port: opts.port })
    return { url: server.url, started: true }
  } catch (error) {
    return { error: `could not start the dashboard: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Cache one ensure result while it is usable; retry after errors. */
export function makeLazyEnsure(load: () => Promise<EnsureDashboardResult>): () => Promise<EnsureDashboardResult> {
  let pending: Promise<EnsureDashboardResult> | undefined
  return () => {
    if (!pending) {
      pending = load().then((result) => {
        if ("error" in result) pending = undefined
        return result
      })
    }
    return pending
  }
}

/** Command handler factory for the /skillhub command. */
export function makeDashboardCommand(opts: { ensure: () => Promise<EnsureDashboardResult>; open: (url: string) => void }) {
  return async (output: { parts: unknown[] }): Promise<void> => {
    const result = await opts.ensure()
    if ("error" in result) {
      output.parts.push({ type: "text", text: `SkillHub dashboard: ${result.error}` })
      return
    }
    opts.open(result.url)
    output.parts.push({
      type: "text",
      text: `SkillHub dashboard: ${result.url}${result.started ? " (started just now)" : ""} — opened in your browser.`,
    })
  }
}
