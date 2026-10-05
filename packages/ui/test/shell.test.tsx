// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import App from "../src/App.tsx"
import "./setup"

describe("app shell", () => {
  it("renders navigation in all five sections", () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "static" }
    render(<App />)
    const nav = screen.getByRole("navigation", { name: "Sections" })
    expect(nav).toBeInTheDocument()
    for (const label of ["Status", "Gallery", "Clusters", "Trending", "Review"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText("Read-only snapshot")).toBeInTheDocument()
  })

  it("navigates from Status to Gallery", async () => {
    ;(globalThis as { __SKILLHUB__?: unknown }).__SKILLHUB__ = { mode: "static" }
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("link", { name: "Gallery" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Gallery" })).toBeInTheDocument()
  })
})
