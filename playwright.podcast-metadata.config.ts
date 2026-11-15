import { defineConfig } from "@playwright/test";

/** Requiere frontend y simulación ya iniciados; nunca arranca el stack compartido. */
export default defineConfig({
  testDir: ".", testMatch: ["e2e/podcast-metadata.spec.ts", "features/media/tests/media-editor.spec.ts", "e2e/media-pages.spec.ts", "e2e/media-bulk-upload.spec.ts"],
  outputDir: "qa-reports/podcast-metadata/tests", workers: 1, fullyParallel: false, retries: 0, timeout: 45_000,
  expect: { timeout: 10_000 }, reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3056", headless: true,
    locale: "es-CO", timezoneId: "America/Bogota", viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block", trace: "off", video: "off", screenshot: "off" },
});
