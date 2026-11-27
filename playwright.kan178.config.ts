import { defineConfig } from "@playwright/test";

const base = new URL(process.env.KAN178_ERP_URL ?? "http://127.0.0.1:30478");
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.href !== `${base.origin}/`) {
  throw new Error("KAN-178 requiere un ERP HTTP local, sin prefijo.");
}
if (process.env.KAN178_DISPOSABLE_FIXTURE !== "1") {
  throw new Error("KAN-178 modifica reglas XP globales. Usa una base de pruebas desechable y confirma KAN178_DISPOSABLE_FIXTURE=1.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "kan178-rewards.e2e.ts",
  outputDir: "test-results/kan178",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: "list",
  use: {
    baseURL: base.origin,
    viewport: { width: 1440, height: 900 },
    timezoneId: "UTC",
    locale: "es-CO",
    screenshot: "only-on-failure",
  },
});
