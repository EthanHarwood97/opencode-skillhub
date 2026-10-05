// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import OverviewPage from "../src/pages/OverviewPage.tsx"
import { renderPage } from "./helpers.tsx"
import { server } from "./server.ts"
import "./setup"

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("overview", () => {
  it("shows counters, sources and gaps", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(
      http.get("/api/status", () =>
        HttpResponse.json({
          generatedAt: "2026-10-05T00:00:00.000Z",
          counts: { total: 1200, byStatus: { candidate: 1150, quarantined: 50 }, byCategory: {} },
          installed: 4,
          active: 2,
          updates: 1,
          reviewQueue: 7,
          gaps: ["source agentskills: rate limited"],
          sources: [{ source: "github:claude-skills", candidates: 40, fetchedAt: "2026-10-05T00:00:00.000Z", warnings: ["repo x/y: boom"] }],
        }),
      ),
    )
    renderPage(<OverviewPage />)
    expect(await screen.findByText("1,200")).toBeInTheDocument()
    expect(screen.getByText("github:claude-skills")).toBeInTheDocument()
    expect(screen.getByText("source agentskills: rate limited")).toBeInTheDocument()
    expect(screen.getByText(/repo x\/y: boom/)).toBeInTheDocument()
  })

  it("explains an empty catalog", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(http.get("/api/status", () => HttpResponse.json({ error: { code: "not_found", message: "no catalog at /tmp/x" } }, { status: 404 })))
    renderPage(<OverviewPage />)
    expect(await screen.findByText("Couldn't load the catalog status.")).toBeInTheDocument()
    expect(screen.getByText(/no catalog/)).toBeInTheDocument()
  })
})
