import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { extname, join, resolve, sep } from "node:path"
import type { SkillsQuery } from "../../../ui/src/lib/contract.ts"
import { layout } from "../paths.ts"
import { buildClusters, buildDetail, buildReview, buildSkills, buildStatus, buildTrending, loadSnapshot, type UiSnapshot } from "./data.ts"
import { handleActivate, handleInstall, handleUpdateApply, handleUpdateReview, UiActionError, type EngineContext } from "./mutations.ts"

export type UiServerOptions = {
  root: string
  uiDist: string
  port: number
  host?: string
  catalogDir?: string
  fetchImpl?: typeof fetch
  rawBase?: string
  now?: () => Date
}

export type UiServerHandle = {
  url: string
  port: number
  token: string
  close: () => Promise<void>
  snapshot: () => UiSnapshot | { error: string }
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  res.end(JSON.stringify(body))
}

const sendError = (res: ServerResponse, status: number, code: string, message: string): void => {
  sendJson(res, status, { error: { code, message } })
}

const numeric = (value: string | null): number | undefined => {
  if (value === null || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function startUiServer(opts: UiServerOptions): Promise<UiServerHandle> {
  const l = layout(opts.root)
  const token = randomUUID()
  let boundPort = opts.port

  const readSnapshot = () => loadSnapshot(l, opts.catalogDir)

  const readBody = (req: IncomingMessage): Promise<unknown> =>
    new Promise((resolvePromise, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > 65_536) {
          reject(new UiActionError("request body is too large", 413, "invalid"))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on("end", () => {
        try {
          resolvePromise(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")))
        } catch {
          reject(new UiActionError("request body must be JSON", 400, "invalid"))
        }
      })
      req.on("error", reject)
    })

  const guardMutation = (req: IncomingMessage): void => {
    const contentType = String(req.headers["content-type"] ?? "")
    if (!contentType.startsWith("application/json")) throw new UiActionError("content-type must be application/json", 415, "invalid")
    if (req.headers["x-skillhub-token"] !== token) throw new UiActionError("missing or invalid dashboard token", 403, "forbidden")
    const origin = req.headers.origin
    if (origin && origin !== `http://127.0.0.1:${boundPort}` && origin !== `http://localhost:${boundPort}`) {
      throw new UiActionError("cross-origin request rejected", 403, "forbidden")
    }
  }

  const engineContext = (): EngineContext => {
    const snap = readSnapshot()
    if ("error" in snap) throw new UiActionError(snap.error, 404, "not_found")
    return { l, index: snap.index, fetchImpl: opts.fetchImpl, rawBase: opts.rawBase, now: opts.now }
  }

  const injectRuntime = (html: string, runtime: Record<string, unknown>): string =>
    html.includes("</head>")
      ? html.replace("</head>", `<script>window.__SKILLHUB__=${JSON.stringify(runtime)}</script></head>`)
      : `<script>window.__SKILLHUB__=${JSON.stringify(runtime)}</script>${html}`

  const serveIndex = (res: ServerResponse): void => {
    const indexPath = join(opts.uiDist, "index.html")
    if (!existsSync(indexPath)) {
      sendError(res, 500, "internal", 'UI is not built — run "npm run ui:build" first')
      return
    }
    const html = injectRuntime(readFileSync(indexPath, "utf8"), { mode: "live", token })
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
    res.end(html)
  }

  const serveStatic = (res: ServerResponse, pathname: string): boolean => {
    const rel = pathname === "/" ? "index.html" : pathname.slice(1)
    if (rel.includes("\0")) return false
    const base = resolve(opts.uiDist)
    const target = resolve(join(base, rel))
    if (target !== base && !target.startsWith(base + sep)) return false
    if (rel === "index.html") {
      serveIndex(res)
      return true
    }
    if (existsSync(target) && statSync(target).isFile()) {
      const bytes = readFileSync(target)
      res.writeHead(200, {
        "content-type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
        "cache-control": rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-store",
      })
      res.end(bytes)
      return true
    }
    if (extname(rel) === "") {
      serveIndex(res)
      return true
    }
    return false
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      const pathname = decodeURIComponent(url.pathname)

      if (pathname.startsWith("/api/") && req.method === "GET") {
        if (pathname === "/api/status") {
          const snap = readSnapshot()
          if ("error" in snap) return sendError(res, 404, "not_found", snap.error)
          return sendJson(res, 200, buildStatus(snap))
        }
        if (pathname === "/api/skills") {
          const snap = readSnapshot()
          if ("error" in snap) return sendError(res, 404, "not_found", snap.error)
          const query: SkillsQuery = {
            q: url.searchParams.get("q") ?? undefined,
            category: url.searchParams.get("category") ?? undefined,
            status: url.searchParams.get("status") ?? undefined,
            risk: url.searchParams.get("risk") ?? undefined,
            provenance: url.searchParams.get("provenance") ?? undefined,
            cluster: url.searchParams.get("cluster") ?? undefined,
            sort: (url.searchParams.get("sort") as SkillsQuery["sort"] | null) ?? undefined,
            page: numeric(url.searchParams.get("page")),
            pageSize: numeric(url.searchParams.get("pageSize")),
          }
          return sendJson(res, 200, buildSkills(snap, query))
        }
        if (pathname.startsWith("/api/skills/") && pathname.endsWith("/update")) {
          const id = pathname.slice("/api/skills/".length, -"/update".length)
          return sendJson(res, 200, await handleUpdateReview(engineContext(), id))
        }
        if (pathname.startsWith("/api/skills/")) {
          const snap = readSnapshot()
          if ("error" in snap) return sendError(res, 404, "not_found", snap.error)
          const id = pathname.slice("/api/skills/".length)
          const detail = buildDetail(snap, id)
          if (!detail) return sendError(res, 404, "not_found", `no skill with id ${id}`)
          return sendJson(res, 200, detail)
        }
        if (pathname === "/api/clusters") {
          const snap = readSnapshot()
          if ("error" in snap) return sendError(res, 404, "not_found", snap.error)
          return sendJson(res, 200, buildClusters(snap))
        }
        if (pathname === "/api/trending") {
          const snap = readSnapshot()
          if ("error" in snap) return sendError(res, 404, "not_found", snap.error)
          return sendJson(res, 200, buildTrending(snap))
        }
        if (pathname === "/api/review") {
          const snap = readSnapshot()
          if ("error" in snap) return sendError(res, 404, "not_found", snap.error)
          return sendJson(res, 200, buildReview(snap))
        }
        return sendError(res, 404, "not_found", `no route for ${pathname}`)
      }

      if (req.method === "GET" || req.method === "HEAD") {
        if (serveStatic(res, pathname)) return
        return sendError(res, 404, "not_found", `no file for ${pathname}`)
      }

      if (pathname.startsWith("/api/skills/") && req.method === "POST") {
        const rest = pathname.slice("/api/skills/".length)
        guardMutation(req)
        const body = (await readBody(req)) as Record<string, unknown>

        if (rest.endsWith("/install")) {
          const id = rest.slice(0, -"/install".length)
          return sendJson(res, 200, await handleInstall(engineContext(), id, body.dryRun === true))
        }
        if (rest.endsWith("/activate")) {
          const id = rest.slice(0, -"/activate".length)
          return sendJson(res, 200, handleActivate(engineContext(), id, true))
        }
        if (rest.endsWith("/deactivate")) {
          const id = rest.slice(0, -"/deactivate".length)
          return sendJson(res, 200, handleActivate(engineContext(), id, false))
        }
        if (rest.endsWith("/update/apply")) {
          const id = rest.slice(0, -"/update/apply".length)
          return sendJson(res, 200, await handleUpdateApply(engineContext(), id, body.confirm))
        }
        return sendError(res, 404, "not_found", `no action for ${pathname}`)
      }

      return sendError(res, 405, "invalid", `${req.method} is not allowed here`)
    } catch (error) {
      if (error instanceof UiActionError) return sendError(res, error.status, error.code, error.message)
      sendError(res, 500, "internal", error instanceof Error ? error.message : "internal error")
    }
  }

  const server: Server = createServer((req, res) => {
    void handle(req, res)
  })

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(opts.port, opts.host ?? "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : opts.port
      boundPort = port
      resolvePromise({
        url: `http://127.0.0.1:${port}/`,
        port,
        token,
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
        snapshot: readSnapshot,
      })
    })
  })
}
