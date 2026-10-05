// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Modal } from "../src/components/Modal.tsx"
import "./setup"

const renderModal = (dismissible?: boolean) =>
  render(
    <Modal open title="Test modal" onClose={() => {}} dismissible={dismissible}>
      <p>Body</p>
    </Modal>,
  )

describe("Modal", () => {
  it("blocks native cancel and hides the close button when not dismissible", () => {
    renderModal(false)
    const dialog = screen.getByRole("dialog")
    const event = new Event("cancel", { cancelable: true })
    dialog.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(screen.queryByRole("button", { name: "Close dialog" })).not.toBeInTheDocument()
  })

  it("allows native cancel and shows the close button by default", () => {
    renderModal()
    const dialog = screen.getByRole("dialog")
    const event = new Event("cancel", { cancelable: true })
    dialog.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeInTheDocument()
  })
})
