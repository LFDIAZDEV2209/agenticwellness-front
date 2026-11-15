import { defineConfig } from "@playwright/test";

/** Sin autoarranque de servicios; sustituto local aislado del stack compartido. */
export default defineConfig({
  testDir: "./e2e", testMatch: ["weekly-ai-suggestions.spec.ts", "program-week-cell-editor.spec.ts"],
  outputDir: "qa-reports/weekly-ai", workers: 1, fullyParallel: false, retries: 0, timeout: 45_000,
  expect: { timeout: 12_000 }, reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3056", headless: true,
    locale: "es-CO", timezoneId: "America/Bogota", viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block", trace: "off", video: "off", screenshot: "off" },
});
