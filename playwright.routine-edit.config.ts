import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: ["routine-edit-impact.spec.ts", "routine-contraindications.spec.ts", "exercise-routine-catalog.spec.ts", "exercise-demo-link.spec.ts", "exercise-media.spec.ts"],
  outputDir: "qa-reports/routine-edit/tests", workers: 1, retries: 0, timeout: 45_000,
  expect: { timeout: 10_000 }, reporter: [["list"], ["json", { outputFile: "qa-reports/routine-edit/playwright.json" }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3067", headless: true, viewport: { width: 1440, height: 1000 },
    locale: "es-CO", timezoneId: "America/Bogota", serviceWorkers: "block", trace: "off", screenshot: "off", video: "off" },
});
