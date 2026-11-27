import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "motor-timeline.spec.ts",
  workers: 1,
  outputDir: "qa-reports/motor-timeline",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3061",
    serviceWorkers: "block",
    timezoneId: "America/Bogota",
  },
});
