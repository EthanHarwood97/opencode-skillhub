import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const ROUTES = ["/#/", "/#/gallery", "/#/clusters", "/#/trending", "/#/review", "/#/how", "/#/skills/acme-skills/pdf-tool"]

for (const route of ROUTES) {
  test(`axe serious checks pass on ${route}`, async ({ page }) => {
    await page.goto(route)
    await page.waitForLoadState("networkidle")
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
    const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })
}
