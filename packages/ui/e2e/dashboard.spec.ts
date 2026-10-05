import { expect, test } from "@playwright/test"

test("walks the sections and searches the gallery", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "Status" })).toBeVisible()

  await page.getByRole("link", { name: "Gallery" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Gallery" })).toBeVisible()

  await page.getByLabel("Search skills").fill("pdf")
  await page.getByLabel("Search skills").press("Enter")
  await expect(page.getByText("pdf-tool").first()).toBeVisible()
  await expect(page.getByText("seo-audit")).toHaveCount(0)
})

test("opens a skill detail with the score breakdown", async ({ page }) => {
  await page.goto("/#/gallery")
  await page.getByRole("link", { name: /pdf-tool/ }).first().click()
  await expect(page.getByRole("heading", { level: 1, name: "pdf-tool" })).toBeVisible()
  await expect(page.getByText("Why this score")).toBeVisible()
  await expect(page.getByText("Requirements")).toBeVisible()
})
