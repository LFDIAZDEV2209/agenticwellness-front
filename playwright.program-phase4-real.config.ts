import { defineConfig } from "@playwright/test";

/** 4.11 API/BD + UI premium: previews existentes y proveedores propios; nunca webServer. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "program-phase4-api-db.spec.ts",
  outputDir: "qa-reports/program-phase4-real",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: { trace: "off", video: "off", screenshot: "off" },
});
