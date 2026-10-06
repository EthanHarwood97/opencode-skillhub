import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://127.0.0.1:4518", trace: "on-first-retry" },
  webServer: {
    command: "node ../cli/src/bin.ts ui --root .e2e-store --port 4518 --no-open",
    url: "http://127.0.0.1:4518/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { SKILLHUB_UI_DIST: "dist" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
