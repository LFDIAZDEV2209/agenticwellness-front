import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const erp = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3053");
const app = new URL(process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5184");
for (const url of [erp, app]) {
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "2.26 solo admite servidores HTTP locales, sin prefijo de ruta.",
    );
  }
}
const appDirectory = resolve(
  __dirname,
  process.env.E2E_APP_DIR ?? "../.worktrees/app-f2",
);
if (!existsSync(resolve(appDirectory, "package.json"))) {
  throw new Error(
    "Falta el checkout de APP Fase 2. Define E2E_APP_DIR con su ruta.",
  );
}

/** Dos interfaces reales, backend sintético compartido; no requiere seeds ni API. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "program-erp-app.spec.ts",
  outputDir: "qa-reports/program-erp-app",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: erp.origin,
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: "es-CO",
    timezoneId: "America/Bogota",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium-erp-app" }],
  webServer: [
    {
      command: `node node_modules/next/dist/bin/next start -p ${erp.port || "80"}`,
      url: `${erp.origin}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `node node_modules/vite/bin/vite.js --host ${app.hostname} --port ${app.port || "80"} --strictPort`,
      cwd: appDirectory,
      url: app.origin,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { VITE_WEB_SAME_ORIGIN: "true", VITE_DEV_TOOLS: "false" },
    },
  ],
});
