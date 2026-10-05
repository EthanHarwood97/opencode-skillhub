// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import App from "../src/App.tsx"
import "./setup"

describe("app smoke", () => {
  it("renders the SkillHub heading", () => {
    render(<App />)
    expect(screen.getByRole("heading", { level: 1, name: "SkillHub" })).toBeInTheDocument()
  })
})
