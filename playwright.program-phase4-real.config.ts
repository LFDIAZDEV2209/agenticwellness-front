import { defineConfig } from "@playwright/test";

/** API/BD 4.11: stack y proveedores Postman propios ya iniciados; nunca webServer. */
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
