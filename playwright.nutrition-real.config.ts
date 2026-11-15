import { defineConfig } from "@playwright/test";

/** 3.20 requiere servidores de producto y stack real ya levantados por sus dueños. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "nutrition-erp-app-real.spec.ts",
  outputDir: "qa-reports/nutrition-real",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    headless: true,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
    // Credenciales, cookies y capacidades de Storage no deben acabar en trazas.
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
