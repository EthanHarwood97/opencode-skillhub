// @vitest-environment jsdom
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import type { SkillCard } from "../src/lib/contract.ts"
import ReviewPage from "../src/pages/ReviewPage.tsx"
import { renderPage } from "./helpers.tsx"
import { server } from "./server.ts"
import "./setup"

const card = (id: string, over: Partial<SkillCard> = {}): SkillCard => ({
  id,
  name: id.split("/").at(-1) ?? id,
  description: "does a thing",
  category: "engineering",
  tags: [],
  clusterId: "c-1",
  clusterLabel: "Fixture",
  total: 70,
  freshness: 70,
  risk: "low",
  provenance: "sha-pinned",
  status: "candidate",
  sourceKind: "github",
  sourceRepo: "acme/skills",
  installed: false,
  active: false,
  updateAvailable: false,
  ...over,
})

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("review queue", () => {
  it("renders all four sections and opens the update modal", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(
      http.get("/api/review", () =>
        HttpResponse.json({
          newCandidates: [card("acme/new")],
          updates: [{ id: "acme/old", from: 50, to: 80, riskFrom: "medium", riskTo: "low" }],
          quarantined: [card("acme/bad", { status: "quarantined", risk: "critical" })],
          gaps: ["source x: boom"],
          sources: [],
        }),
      ),
      http.get("/api/skills/:id/update", () =>
        HttpResponse.json({ kind: "update", changes: [{ path: "SKILL.md", status: "modified", patch: "--- a\n+++ b\n" }], riskDelta: { from: "medium", to: "low" }, scoreDelta: { from: 50, to: 80 } }),
      ),
    )
    const user = userEvent.setup()
    renderPage(<ReviewPage />)

    expect(await screen.findByText("New this week")).toBeInTheDocument()
    expect(screen.getByText("acme/new")).toBeInTheDocument()
    expect(screen.getByText("Updates available")).toBeInTheDocument()
    expect(screen.getByText("50 → 80")).toBeInTheDocument()
    expect(screen.getByText("Quarantined")).toBeInTheDocument()
    expect(screen.getByText("acme/bad")).toBeInTheDocument()
    expect(screen.getByText("source x: boom")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Review update" }))
    expect(await screen.findByText("SKILL.md")).toBeInTheDocument()
  })

  it("shows the calm empty state", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(http.get("/api/review", () => HttpResponse.json({ newCandidates: [], updates: [], quarantined: [], gaps: [], sources: [] })))
    renderPage(<ReviewPage />)
    expect(await screen.findByText("Nothing needs your attention. The next sync will surface new candidates here.")).toBeInTheDocument()
  })

  it("replaces the update action with a note in static mode", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "static" }
    server.use(
      http.get("data/review.json", () =>
        HttpResponse.json({
          newCandidates: [card("acme/new")],
          updates: [{ id: "acme/old", from: 50, to: 80, riskFrom: "medium", riskTo: "low" }],
          quarantined: [card("acme/bad", { status: "quarantined", risk: "critical" })],
          gaps: ["source x: boom"],
          sources: [],
        }),
      ),
    )
    renderPage(<ReviewPage />)

    expect(await screen.findByText("Exported gallery: actions run in the local dashboard.")).toBeInTheDocument()
    expect(screen.getByText("50 → 80")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Review update" })).not.toBeInTheDocument()
  })
})
