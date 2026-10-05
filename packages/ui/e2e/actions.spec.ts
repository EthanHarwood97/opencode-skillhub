import { expect, test } from "@playwright/test"

test("toggles activation with an explicit confirm", async ({ page }) => {
  await page.goto("/#/skills/acme-skills/pdf-tool")
  const toggle = page.getByRole("button", { name: /^(Activate|Deactivate)$/ })
  await expect(toggle).toBeVisible()
  const before = ((await toggle.textContent()) ?? "").trim()

  await toggle.click()
  await page.getByRole("button", { name: before === "Activate" ? "Activate skill" : "Deactivate skill" }).click()
  await expect(page.getByText(before === "Activate" ? /Activated pdf-tool/ : /Deactivated pdf-tool/)).toBeVisible()
  await expect(page.getByRole("button", { name: before === "Activate" ? "Deactivate" : "Activate" })).toBeVisible()
})
