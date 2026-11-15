import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { readQaPassword } from "../../e2e/helpers/nutrition-real-credentials.mjs";

// QA real de 4.8: login UI, credencial solo en memoria, sin generar/aplicar automáticamente.
const fixture = JSON.parse(readFileSync(process.argv[2], "utf8"));
const role = process.argv[3] ?? "generator";
const week = Number(process.argv[4] ?? fixture.weekNumber ?? fixture.targetWeekNumber);
const port = Number(process.argv[5] ?? 9242);
const account = fixture.accounts?.[role];
if (!["generator", "reader", "nutritionist", "coordinator", "foreignReader", "foreignNutritionist"].includes(role) || !account
  || !/^[a-f0-9-]{36}$/i.test(fixture.patientId) || !Number.isInteger(week) || week < 1 || week > 83
  || !Number.isInteger(port) || port < 9200 || port > 9299) throw new Error("Metadata QA inválida.");
const origin = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3056");
if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Solo ERP local.");
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"] });
const events = [], pageErrors = [];
let ready = false, stage = "login";
browser.on("disconnected", () => {
  mkdirSync("qa-reports/weekly-ai-real", { recursive: true });
  writeFileSync(`qa-reports/weekly-ai-real/${role}.json`, JSON.stringify({ live: true, apiInterception: false, role, patientId: fixture.patientId, week, ready, events, pageErrors }, null, 2));
});
process.on("SIGINT", () => void browser.close());
process.on("SIGTERM", () => void browser.close());
try {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 1000 }, locale: "es-CO", timezoneId: "America/Bogota" });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.name));
  page.on("response", async response => {
    const path = new URL(response.url()).pathname;
    if (!path.includes("/ai-suggestions")) return;
    const body = await response.json().catch(() => null);
    events.push({ method: response.request().method(), path, httpStatus: response.status(), status: body?.status ?? null,
      draftId: body?.draft?.id ?? body?.briefId ?? null, language: body?.draft?.language ?? null,
      generatedAt: body?.draft?.generatedAt ?? null, model: body?.draft?.model ?? null, stale: body?.draft?.stale ?? null,
      suggestions: body?.draft?.suggestions?.map(s => ({ index: s.index, date: s.date, kind: s.kind, state: s.state, appliedAt: s.appliedAt, appliedBy: s.appliedBy })) ?? null,
      appliedIndex: body?.index ?? null, cacheControl: response.headers()["cache-control"] ?? null });
  });
  await page.goto(origin.origin + "/login");
  await page.locator("#email").fill(account.login);
  await page.locator("#password").fill(readQaPassword(account.credentialTarget));
  await page.getByRole("slider", { name: "Comencemos", exact: true }).press("End");
  await page.waitForURL(/\/dashboard/);
  stage = "profile";
  await page.goto(`${origin.origin}/patients/${fixture.patientId}/360`);
  await page.getByRole("tab", { name: /^(Plan semanal|Weekly plan)$/ }).click();
  stage = "week";
  await page.getByRole("row").filter({ has: page.getByRole("cell", { name: new RegExp(`^${week} (Ver tareas|View tasks)$`) }) })
    .getByRole("button", { name: /^(Ver tareas|View tasks)$/ }).click();
  await page.getByRole("dialog", { name: new RegExp(`^(Semana|Week) ${week}$`) }).getByRole("article").first().waitFor();
  ready = true;
  console.log(JSON.stringify({ ready, role, week, pid: process.pid, port, apiInterception: false }));
} catch (error) {
  console.error(JSON.stringify({ ready: false, stage, error: error.name }));
  await browser.close(); process.exitCode = 1;
}
