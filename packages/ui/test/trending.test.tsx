// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import TrendingPage from "../src/pages/TrendingPage.tsx"
import { card } from "./fixtures.ts"
import { renderPage } from "./helpers.tsx"
import { server } from "./server.ts"
import "./setup"

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("trending", () => {
  it("renders velocity deltas and the new-this-month list", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(
      http.get("/api/trending", () =>
        HttpResponse.json({
          generatedAt: "2026-10-05T00:00:00.000Z",
          topVelocity: [{ card: card("acme/x"), stars: 100, delta7d: 20, delta30d: 50 }],
          newThisMonth: [{ card: card("acme/new"), stars: 5, createdAt: "2026-09-20T00:00:00.000Z" }],
        }),
      ),
    )
    renderPage(<TrendingPage />)

    expect(await screen.findByText("+20")).toBeInTheDocument()
    expect(screen.getByText("+50")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "new" })).toHaveAttribute("href", "/skills/acme/new")
  })

  it("explains an empty trend set", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(http.get("/api/trending", () => HttpResponse.json({ generatedAt: "2026-10-05T00:00:00.000Z", topVelocity: [], newThisMonth: [] })))
    renderPage(<TrendingPage />)
    expect(await screen.findByText("No velocity data yet. Trends build as daily snapshots accumulate.")).toBeInTheDocument()
  })
})
