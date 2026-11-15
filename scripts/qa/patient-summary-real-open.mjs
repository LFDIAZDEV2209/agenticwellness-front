import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { readQaPassword } from "../../e2e/helpers/nutrition-real-credentials.mjs";

// QA real 4.7: credenciales en memoria, ninguna generación automática ni interceptación.
const fixture = JSON.parse(readFileSync(process.argv[2], "utf8"));
const role = process.argv[3] ?? "nutritionist";
const port = Number(process.argv[4] ?? 9238);
if (!["nutritionist", "coordinator", "foreignNutritionist", "generator"].includes(role)) throw new Error("Rol QA inválido.");
if (!Number.isInteger(port) || port < 9200 || port > 9299) throw new Error("Puerto QA inválido.");
const account = fixture.accounts[role];
if (!account || !/^[a-f0-9-]{36}$/i.test(fixture.patientId)) throw new Error("Metadata QA inválida.");
const origin = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3056");
if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Solo ERP local.");
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"] });
const events = [];
const pageErrors = [];
let stage = "login";
let ready = false;
browser.on("disconnected", () => {
  mkdirSync("qa-reports/patient-summary-real", { recursive: true });
  writeFileSync(`qa-reports/patient-summary-real/${role}.json`, JSON.stringify({
    live: true, apiInterception: false, role, patientId: fixture.patientId, ready, events, pageErrors,
  }, null, 2));
});
process.on("SIGINT", () => void browser.close());
process.on("SIGTERM", () => void browser.close());
try {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 1000 }, locale: "es-CO", timezoneId: "America/Bogota" });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.name));
  page.on("response", async response => {
    const path = new URL(response.url()).pathname;
    if (!path.endsWith("/ai-summary")) return;
    const body = await response.json().catch(() => null);
    events.push({ method: response.request().method(), path, httpStatus: response.status(),
      status: body?.status ?? null, hasSummary: !!body?.summary, generatedAt: body?.summary?.generatedAt ?? null,
      language: body?.summary?.language ?? null, model: body?.summary?.model ?? null,
      cacheControl: response.headers()["cache-control"] ?? null });
  });
  await page.goto(origin.origin + "/login");
  await page.locator("#email").fill(account.login);
  await page.locator("#password").fill(readQaPassword(account.credentialTarget));
  await page.getByRole("slider", { name: "Comencemos", exact: true }).press("End");
  await page.waitForURL(/\/dashboard/);
  stage = "profile";
  await page.goto(`${origin.origin}/patients/${fixture.patientId}/360`);
  await page.getByRole("tab", { name: /^(Resumen|Summary)$/ }).waitFor();
  ready = true;
  console.log(JSON.stringify({ ready, role, pid: process.pid, port, apiInterception: false }));
} catch (error) {
  console.error(JSON.stringify({ ready: false, stage, error: error.name }));
  await browser.close();
  process.exitCode = 1;
}
