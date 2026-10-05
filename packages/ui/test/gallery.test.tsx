// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import type { SkillCard } from "../src/lib/contract.ts"
import GalleryPage from "../src/pages/GalleryPage.tsx"
import { renderPage } from "./helpers.tsx"
import { server } from "./server.ts"
import "./setup"

const card = (id: string, over: Partial<SkillCard> = {}): SkillCard => ({
  id,
  name: id.split("/").at(-1) ?? id,
  description: "does a thing",
  category: "engineering",
  tags: ["test"],
  clusterId: "c-1",
  clusterLabel: "Fixture",
  total: 50,
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

const CARDS = [card("acme/pdf-tool", { name: "PDF Tool", description: "extract text from pdf" }), card("acme/seo-audit", { name: "SEO Audit" })]

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const respond = (items: SkillCard[]) => HttpResponse.json({ total: items.length, page: 1, pageSize: 48, items })

describe("gallery", () => {
  it("renders cards and filters on submit", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(
      http.get("/api/skills", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? ""
        return respond(q ? CARDS.filter((c) => c.name.toLowerCase().includes(q)) : CARDS)
      }),
    )
    const user = userEvent.setup()
    renderPage(<GalleryPage />)

    expect(await screen.findByText("PDF Tool")).toBeInTheDocument()
    expect(screen.getByText("SEO Audit")).toBeInTheDocument()

    await user.type(screen.getByLabelText("Search skills"), "pdf")
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.queryByText("SEO Audit")).not.toBeInTheDocument())
    expect(screen.getByText("PDF Tool")).toBeInTheDocument()
  })

  it("shows the empty state and clears filters", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(
      http.get("/api/skills", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q")
        return respond(q ? [] : CARDS)
      }),
    )
    const user = userEvent.setup()
    renderPage(<GalleryPage />, "/gallery?q=zzz")

    expect(await screen.findByText("No skills match these filters.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    await waitFor(() => expect(screen.queryByText("No skills match these filters.")).not.toBeInTheDocument())
    expect(screen.getByText("PDF Tool")).toBeInTheDocument()
  })

  it("shows an error state when the API fails", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(http.get("/api/skills", () => HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 })))
    renderPage(<GalleryPage />)
    expect(await screen.findByText("Couldn't load the gallery.")).toBeInTheDocument()
    expect(screen.getByText("boom")).toBeInTheDocument()
  })

  it("keeps cards visible and shows an updating hint while filters load", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get("/api/skills", async ({ request }) => {
        const category = new URL(request.url).searchParams.get("category")
        if (category) {
          await gate
          return respond([card("acme/only-test", { name: "Only Test", category: "testing" })])
        }
        return respond(CARDS)
      }),
    )
    const user = userEvent.setup()
    const { container } = renderPage(<GalleryPage />)

    expect(await screen.findByText("PDF Tool")).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("Category"), "testing")

    expect(await screen.findByText(/updating/)).toBeInTheDocument()
    expect(screen.getByText("PDF Tool")).toBeInTheDocument()
    expect(container.querySelector('[class*="skeleton"]')).toBeNull()

    release()
    expect(await screen.findByText("Only Test")).toBeInTheDocument()
  })

  it("renders a single Active chip for an active skill", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(http.get("/api/skills", () => respond([card("acme/live-skill", { name: "Live Skill", active: true, status: "active" })])))
    renderPage(<GalleryPage />)
    const cardLink = await screen.findByRole("link", { name: /Live Skill/ })
    expect(within(cardLink).getAllByText("Active")).toHaveLength(1)
  })
})
