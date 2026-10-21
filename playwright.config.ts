import { defineConfig, devices } from "@playwright/test";

// Two targets:
// - default: the site against e2e/fake-auctions.mjs (a stand-in API and sign-in), so the tests run anywhere;
// - E2E_TARGET=stack: against a running Doubleslash Auctions (its local stack or CI), with SITE_AUTHORITY, SITE_API and
//   SITE_TENANT set and this site's origin (http://localhost:5190) registered for the house. Used by the platform's CI.
const stack = process.env.E2E_TARGET === "stack";
const fake = "http://localhost:5191";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:5190", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: [
    ...(stack ? [] : [{ command: "node e2e/fake-auctions.mjs", url: `${fake}/health`, reuseExistingServer: !process.env.CI }]),
    {
      command: "pnpm build && node e2e/serve.mjs",
      url: "http://localhost:5190/config.js",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        SITE_AUTHORITY: process.env.SITE_AUTHORITY ?? `${fake}/realms/acme`,
        SITE_API: process.env.SITE_API ?? `${fake}/api/v1`,
        SITE_TENANT: process.env.SITE_TENANT ?? "acme",
        SITE_CLIENT_ID: process.env.SITE_CLIENT_ID ?? "headless",
      },
    },
  ],
});
