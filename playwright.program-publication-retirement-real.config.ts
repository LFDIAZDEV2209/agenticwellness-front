import { defineConfig } from "@playwright/test";

/** Usa únicamente el stack existente. No inicia servidores ni intercepta HTTP. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["program-template-impact-real.spec.ts", "media-retirement-real.spec.ts"],
  outputDir: "qa-reports/publication-retirement-real/tests",
  workers: 1, retries: 0, timeout: 360_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", viewport: { width: 1440, height: 1000 },
    actionTimeout: 20_000, navigationTimeout: 30_000,
    headless: true, locale: "es-CO", timezoneId: "America/Bogota",
    serviceWorkers: "block", trace: "off", video: "off", screenshot: "off" },
});
