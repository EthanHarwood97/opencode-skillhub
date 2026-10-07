// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import HowItWorksPage from "../src/pages/HowItWorksPage.tsx"
import { renderPage } from "./helpers.tsx"
import { server } from "./server.ts"
import "./setup"

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("how it works", () => {
  it("tells the machine story with live counts", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(
      http.get("/api/status", () =>
        HttpResponse.json({
          generatedAt: "2026-10-07T00:00:00.000Z",
          counts: { total: 3662, byStatus: { candidate: 3544, quarantined: 118 }, byCategory: {} },
          installed: 30,
          active: 24,
          updates: 0,
          reviewQueue: 0,
          gaps: [],
          sources: [],
          coverage: [],
        }),
      ),
    )
    renderPage(<HowItWorksPage />)

    expect(await screen.findByText(/3,662 skills charted/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: /Your agent is only as good as the skills it can find/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Six stages stand between raw repositories and your active set." })).toBeInTheDocument()
    expect(screen.getByText(/SkillHub cannot promise a skill is safe/)).toBeInTheDocument()
    expect(screen.getByText(/git clone https:\/\/github.com\/EthanHarwood97\/opencode-skillhub/)).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "Open the dashboard" }).length).toBeGreaterThan(0)
  })
})
