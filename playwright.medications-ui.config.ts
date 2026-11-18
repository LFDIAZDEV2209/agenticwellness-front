import { defineConfig } from "@playwright/test";

/** UI con contratos sintéticos; el recorrido PostgreSQL compartido usa otra configuración. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "medications-ui.spec.ts",
  outputDir: "/tmp/copp-medications-erp-ui/results",
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    headless: true,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    viewport: { width: 1440, height: 900 },
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
