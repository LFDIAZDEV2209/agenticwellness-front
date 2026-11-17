import { defineConfig } from "@playwright/test";

/** Smoke aislado: servidor ERP existente, transporte sintético y sin stack compartido. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "audit.spec.ts",
  outputDir: "test-results/audit",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3061",
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: "es-CO",
    timezoneId: "America/Bogota",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
