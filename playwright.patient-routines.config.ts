import { defineConfig } from "@playwright/test";
/** Solo procesos QA ya iniciados; nunca arranca el stack compartido. */
export default defineConfig({
  testDir: "./e2e", testMatch: ["patient-routines.spec.ts", "bienestar-fase1.spec.ts"],
  outputDir: "qa-reports/patient-routines/tests", workers: 1, retries: 0, fullyParallel: false, timeout: 45_000,
  expect: { timeout: 10_000 }, reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3067", headless: true, viewport: { width: 1440, height: 1000 },
    locale: "es-CO", timezoneId: "America/Bogota", serviceWorkers: "block", trace: "off", screenshot: "off", video: "off" },
});
