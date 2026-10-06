// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import type { SkillDetail } from "../src/lib/contract.ts"
import DetailPage from "../src/pages/DetailPage.tsx"
import { renderRoute } from "./helpers.tsx"
import { server } from "./server.ts"
import "./setup"

const detail = (over: Partial<SkillDetail> = {}): SkillDetail => ({
  id: "acme/one",
  name: "PDF Tool",
  description: "Extract text from PDF files.",
  category: "writing",
  labels: [],
  tags: ["pdf"],
  clusterId: "c-1",
  clusterLabel: "Pdf",
  total: 88,
  freshness: 80,
  risk: "low",
  provenance: "sha-pinned",
  status: "candidate",
  sourceKind: "github",
  sourceRepo: "acme/skills",
  installed: false,
  active: false,
  updateAvailable: false,
  scores: { total: 88, quality: 90, trust: 85, freshness: 80, compatibility: 100, adoption: 40, reasons: ["quality: rubric-v1 90 — clear workflow"], rubricVersion: "rubric-v1", evaluatedAt: "2026-10-05T00:00:00.000Z" },
  riskFindings: [],
  requires: { runtime: ["node"], scripts: [], mcp: [], env: ["OPENAI_API_KEY"], services: ["github"] },
  files: [{ path: "SKILL.md", size: 2048 }],
  relations: { supersedes: [], duplicates: [], alternatives: ["acme/two"] },
  source: { kind: "github", repo: "acme/skills", path: "one/SKILL.md", ref: "abc123", license: "MIT", licenseFlags: [] },
  signals: { stars: 12, starVelocity30d: 1, forks: 2, installs: 0, views: 0, pushedAt: "2026-09-01T00:00:00.000Z", createdAt: "2025-01-01T00:00:00.000Z", archived: false },
  ...over,
})

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const renderDetail = () => renderRoute("/skills/*", "/skills/acme/one", <DetailPage />)

describe("skill detail", () => {
  it("renders the record: scores, reasons, requirements and source", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(http.get("/api/skills/:id", () => HttpResponse.json(detail({ labels: ["pdf", "documentation"] }))))
    renderDetail()

    expect(await screen.findByRole("heading", { level: 1, name: "PDF Tool" })).toBeInTheDocument()
    expect(screen.getByText("Documentation")).toBeInTheDocument()
    expect(screen.getByText("Why this score")).toBeInTheDocument()
    expect(screen.getByText(/clear workflow/)).toBeInTheDocument()
    expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument()
    expect(screen.getByText("acme/skills")).toBeInTheDocument()
    expect(screen.getByText("SKILL.md")).toBeInTheDocument()
    expect(screen.getByText("No findings. The static scan came back clean.")).toBeInTheDocument()
  })

  it("renders a risk finding when the scan flags a rule", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    server.use(
      http.get("/api/skills/:id", () =>
        HttpResponse.json(detail({ riskFindings: [{ rule: "exfil.credential-paths", severity: "critical", line: 4, match: ".ssh/id_rsa" }] })),
      ),
    )
    renderDetail()

    expect(await screen.findByText("exfil.credential-paths")).toBeInTheDocument()
  })

  it("verifies before install, then installs", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    let installed = false
    server.use(
      http.get("/api/skills/:id", () => HttpResponse.json(detail({ installed }))),
      http.post("/api/skills/:id/install", async ({ request }) => {
        const body = (await request.json()) as { dryRun?: boolean }
        if (body.dryRun) return HttpResponse.json({ status: "verified", entry: { id: "acme/one", contentHash: "h", provenanceTier: "sha-pinned", riskLevel: "low", total: 88 } })
        installed = true
        return HttpResponse.json({ status: "installed", entry: { id: "acme/one", contentHash: "h", provenanceTier: "sha-pinned", riskLevel: "low", total: 88 } })
      }),
    )
    const user = userEvent.setup()
    renderDetail()

    await user.click(await screen.findByRole("button", { name: "Install" }))
    expect(await screen.findByText(/Verified: sha-pinned, risk low, score 88/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Install now" }))
    expect(await screen.findByText(/Installed PDF Tool/)).toBeInTheDocument()
    await waitFor(() => expect(installed).toBe(true))
  })

  it("requires a confirm before activating", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "live", token: "t" }
    let activated = false
    server.use(
      http.get("/api/skills/:id", () => HttpResponse.json(detail({ installed: true, active: activated }))),
      http.post("/api/skills/:id/activate", () => {
        activated = true
        return HttpResponse.json({ status: "active" })
      }),
    )
    const user = userEvent.setup()
    renderDetail()

    await user.click(await screen.findByRole("button", { name: "Activate" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Activate skill" }))
    expect(await screen.findByText(/Activated PDF Tool/)).toBeInTheDocument()
    await waitFor(() => expect(activated).toBe(true))
  })

  it("replaces actions with a note in static mode", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "static" }
    server.use(http.get("data/skills.json", () => HttpResponse.json([detail()])))
    renderDetail()
    expect(await screen.findByText("Exported gallery: actions run in the local dashboard.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument()
  })
})
