// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { categoryLabel, clampText, formatBytes, formatNumber, relativeTime, statusLabel } from "../src/lib/format.ts"
import "./setup"

describe("format helpers", () => {
  it("formats numbers and bytes", () => {
    expect(formatNumber(12345)).toBe("12,345")
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1536)).toBe("1.5 KiB")
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MiB")
  })

  it("formats relative time against an injected now", () => {
    const now = new Date("2026-10-05T12:00:00Z")
    expect(relativeTime("2026-10-05T11:30:00Z", now)).toBe("30 minutes ago")
    expect(relativeTime("2026-10-04T12:00:00Z", now)).toBe("yesterday")
    expect(relativeTime("2026-09-28T12:00:00Z", now)).toBe("7 days ago")
    expect(relativeTime(null, now)).toBe("unknown")
  })

  it("labels categories and statuses", () => {
    expect(categoryLabel("design-ui")).toBe("Design & UI")
    expect(statusLabel("candidate")).toBe("Library")
    expect(statusLabel("quarantined")).toBe("Quarantined")
  })

  it("clamps text at a word boundary", () => {
    expect(clampText("extract text from pdf documents cleanly", 20)).toBe("extract text from…")
    expect(clampText("short", 20)).toBe("short")
  })
})
