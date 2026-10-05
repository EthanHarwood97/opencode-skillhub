// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
          coverage: [
            { profile: "coding", coverage: 33, gaps: [{ category: "testing", supply: 0, min: 3, top: [] }] },
          ],
        }),
      ),
    )
    renderPage(<OverviewPage />)
    expect(await screen.findByText("1,200")).toBeInTheDocument()
    expect(screen.getByText("github:claude-skills")).toBeInTheDocument()
    expect(screen.getByText("source agentskills: rate limited")).toBeInTheDocument()
    expect(screen.getByText(/repo x\/y: boom/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Coverage" })).toBeInTheDocument()
    expect(screen.getByText("What each goal profile needs, measured against the catalog.")).toBeInTheDocument()
    expect(screen.getByText("coding")).toBeInTheDocument()
    expect(screen.getByText("33%")).toBeInTheDocument()
    const gapChip = screen.getByRole("link", { name: "testing 0/3" })
    expect(gapChip).toHaveAttribute("href", "/gallery?category=testing")
  })

  it("explains an empty catalog in the coverage panel", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(
      http.get("/api/status", () =>
        HttpResponse.json({
          generatedAt: "2026-10-05T00:00:00.000Z",
          counts: { total: 0, byStatus: {}, byCategory: {} },
          installed: 0,
          active: 0,
          updates: 0,
          reviewQueue: 0,
          gaps: [],
          sources: [],
          coverage: [
            { profile: "coding", coverage: 0, gaps: [] },
            { profile: "content", coverage: 0, gaps: [] },
            { profile: "research", coverage: 0, gaps: [] },
            { profile: "business-ops", coverage: 0, gaps: [] },
            { profile: "design-creative", coverage: 0, gaps: [] },
          ],
        }),
      ),
    )
    renderPage(<OverviewPage />)
    expect(await screen.findByText("No skills yet — run a sync to populate the catalog.")).toBeInTheDocument()
    expect(screen.queryByText("coding")).not.toBeInTheDocument()
  })

  it("bulk installs the top skills for a gap", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    const installs: string[] = []
    server.use(
      http.get("/api/status", () =>
        HttpResponse.json({
          generatedAt: "2026-10-05T00:00:00.000Z",
          counts: { total: 1200, byStatus: { candidate: 1150 }, byCategory: {} },
          installed: 4,
          active: 2,
          updates: 1,
          reviewQueue: 7,
          gaps: [],
          sources: [],
          coverage: [
            {
              profile: "coding",
              coverage: 72,
              gaps: [
                {
                  category: "testing",
                  supply: 0,
                  min: 3,
                  top: [
                    { id: "acme/one", name: "Test One", total: 74 },
                    { id: "acme/two", name: "Test Two", total: 68 },
                  ],
                },
              ],
            },
          ],
        }),
      ),
      http.post("/api/skills/:id/install", async ({ request, params }) => {
        installs.push(String(params.id))
        const body = (await request.json()) as { dryRun?: boolean }
        expect(body.dryRun).toBe(false)
        return HttpResponse.json({
          status: "installed",
          entry: { id: String(params.id), contentHash: "h", provenanceTier: "sha-pinned", riskLevel: "low", total: 74 },
        })
      }),
    )
    const user = userEvent.setup()
    renderPage(<OverviewPage />)

    await user.click(await screen.findByRole("button", { name: "Review for install" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Install skills for testing")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Test One (acme/one, score 74)" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Test Two (acme/two, score 68)" })).toBeChecked()

    await user.click(screen.getByRole("button", { name: "Install selected" }))

    expect(await screen.findByText("Installed 2 skills. Activate them from the gallery when you're ready.")).toBeInTheDocument()
    expect(installs).toEqual(["acme/one", "acme/two"])
  })

  it("hides install actions in static mode", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "static" }
    server.use(
      http.get("data/status.json", () =>
        HttpResponse.json({
          generatedAt: "2026-10-05T00:00:00.000Z",
          counts: { total: 1200, byStatus: { candidate: 1150 }, byCategory: {} },
          installed: 4,
          active: 2,
          updates: 1,
          reviewQueue: 7,
          gaps: [],
          sources: [],
          coverage: [
            { profile: "coding", coverage: 72, gaps: [{ category: "testing", supply: 0, min: 3, top: [{ id: "acme/one", name: "Test One", total: 74 }] }] },
          ],
        }),
      ),
    )
    renderPage(<OverviewPage />)

    expect(await screen.findByText("coding")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "testing 0/3" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Review for install" })).not.toBeInTheDocument()
  })

  it("explains an empty catalog", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(http.get("/api/status", () => HttpResponse.json({ error: { code: "not_found", message: "no catalog at /tmp/x" } }, { status: 404 })))
    renderPage(<OverviewPage />)
    expect(await screen.findByText("Couldn't load the catalog status.")).toBeInTheDocument()
    expect(screen.getByText(/no catalog/)).toBeInTheDocument()
  })
})
