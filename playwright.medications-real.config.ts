import { defineConfig } from "@playwright/test";

/** Integración local real: API/Auth + PostgreSQL aislado; sin intercepción de APIs. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "medications-cross-app-real.spec.ts",
  outputDir: process.env.COP_E2E_OUTPUT ?? "/tmp/copp-medication-e2e/playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    headless: true,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
