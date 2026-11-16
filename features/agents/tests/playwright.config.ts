import { defineConfig } from "@playwright/test";

// Servidor propio iniciado en background; nunca arranca ni reutiliza el stack compartido.
export default defineConfig({
  testDir: ".",
  outputDir: "../../../test-results/vita-erp",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3067",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
