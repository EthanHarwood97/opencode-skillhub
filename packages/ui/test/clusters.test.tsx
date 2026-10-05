// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import ClustersPage from "../src/pages/ClustersPage.tsx"
import { card } from "./fixtures.ts"
import { renderPage } from "./helpers.tsx"
import { server } from "./server.ts"
import "./setup"

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("clusters", () => {
  it("renders cluster label, count, top skill and alternatives", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(
      http.get("/api/clusters", () =>
        HttpResponse.json({
          generatedAt: "2026-10-05T00:00:00.000Z",
          clusters: [{ id: "c-1", label: "Pdf", category: "writing", count: 3, top: card("acme/pdf-tool"), alternatives: [card("acme/pdf-2")] }],
        }),
      ),
    )
    renderPage(<ClustersPage />)

    expect(await screen.findByText("Pdf")).toBeInTheDocument()
    expect(screen.getByText("3 skills")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "pdf-tool" })).toHaveAttribute("href", "/skills/acme/pdf-tool")
    expect(screen.getByRole("link", { name: "pdf-2" })).toHaveAttribute("href", "/skills/acme/pdf-2")
  })

  it("explains an empty cluster list", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(http.get("/api/clusters", () => HttpResponse.json({ generatedAt: "2026-10-05T00:00:00.000Z", clusters: [] })))
    renderPage(<ClustersPage />)
    expect(await screen.findByText("No clusters yet — run a sync with clustering on.")).toBeInTheDocument()
  })
})
