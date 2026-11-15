import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

// Reutiliza la misma fixture E2E compilada por tsc, sin replicar respuestas.
const require = createRequire(import.meta.url);
const { setupWeeklyAi } = require(process.argv[2]);
const port = Number(process.argv[3] ?? 9241);
if (!Number.isInteger(port) || port < 9200 || port > 9299) throw new Error("Puerto QA inválido.");
for (const value of [process.env.E2E_BASE_URL ?? "http://127.0.0.1:3056", process.env.E2E_WEEKLY_SIM_URL ?? "http://127.0.0.1:4539"]) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Solo QA local.");
}
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"] });
let qa;
browser.on("disconnected", () => {
  mkdirSync("qa-reports/weekly-ai-sim", { recursive: true });
  writeFileSync("qa-reports/weekly-ai-sim/mcp-session.json", JSON.stringify({ simulated: true, provider: "Postman4.5b", calls: qa?.calls, pageErrors: qa?.errors }, null, 2));
});
process.on("SIGINT", () => void browser.close());
process.on("SIGTERM", () => void browser.close());
try {
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3056", serviceWorkers: "block", viewport: { width: 1440, height: 1000 }, locale: "es-CO", timezoneId: "America/Bogota" });
  const page = await context.newPage();
  qa = await setupWeeklyAi(page, { manage: true });
  await qa.panel.waitFor();
  console.log(JSON.stringify({ ready: true, simulated: true, pid: process.pid, port }));
} catch (error) {
  console.error(JSON.stringify({ ready: false, error: error.name }));
  await browser.close(); process.exitCode = 1;
}
