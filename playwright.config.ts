import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4300";
const apiOrigin = process.env.PLAYWRIGHT_API_ORIGIN ?? "http://127.0.0.1:4301";
const workerOrigin = process.env.PLAYWRIGHT_WORKER_ORIGIN ?? "http://127.0.0.1:4302";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.08,
    },
  },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never", outputFolder: "test-results/playwright-report" }]] : "list",
  outputDir: "test-results/playwright",
  snapshotPathTemplate: "{testDir}/screenshots/{arg}{ext}",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm exec tsx --tsconfig apps/api/tsconfig.json apps/api/src/main.ts",
      url: `${apiOrigin}/api/v1/auth/me`,
      env: process.env,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm exec tsx tests/e2e/worker-server.ts",
      url: workerOrigin,
      env: process.env,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @hirescope/web dev --hostname 127.0.0.1 --port 4300",
      url: baseURL,
      env: { ...process.env, API_ORIGIN: apiOrigin },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
