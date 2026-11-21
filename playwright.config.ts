import { defineConfig, devices } from "@playwright/test";

// E2E-tests kører mod en separat database, som tømmes før hver kørsel.
// Kræver en build først: `npm run build && npm run test:e2e`.
export const TEST_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_test";
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/owner.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    // Playwright starter serveren før globalSetup, så vi venter på et endpoint uden database.
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { DATABASE_URL: TEST_DATABASE_URL, ALLOW_REGISTRATION: "false" },
  },
});
