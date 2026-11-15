import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

// Puente MCP de la misma fixture compilada por tsc; no duplica respuestas del ERP.
const require = createRequire(import.meta.url);
const { mockProfile360Http, profilePatientId } = require(process.argv[2]);
const port = Number(process.argv[3] ?? 9239);
if (!Number.isInteger(port) || port < 9200 || port > 9299) throw new Error("Puerto QA inválido.");
const origin = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3056");
const sim = new URL(process.env.E2E_SUMMARY_SIM_URL ?? "http://127.0.0.1:4537");
for (const url of [origin, sim]) if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Solo QA local.");
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"] });
const pageErrors = [];
const calls = [];
browser.on("disconnected", () => {
  mkdirSync("qa-reports/patient-summary-sim", { recursive: true });
  writeFileSync("qa-reports/patient-summary-sim/mcp-session.json", JSON.stringify({ live: false, provider: "Postman4.4b", pageErrors, calls }, null, 2));
});
process.on("SIGINT", () => void browser.close());
process.on("SIGTERM", () => void browser.close());
try {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 1000 }, locale: "es-CO", timezoneId: "America/Bogota" });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.name));
  await mockProfile360Http(page, { baseUrl: origin.origin, permissions: ["Patients.View", "Program.Profile360View", "Program.AiView", "Program.AiManage", "Program.View", "Wellness.View", "Nutrition.View", "Nutrition.RecordsView"] });
  const session = `qa47-mcp-${randomUUID()}`;
  await page.route("**/api/v1/program/erp/patients/*/ai-summary*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    const response = await page.request.fetch(sim.origin + url.pathname + url.search, {
      method: request.method(), headers: { "Content-Type": "application/json", "x-mock-slug": "summary-erp", "x-mock-session": session },
      ...(body ? { data: body } : {}),
    });
    calls.push({ method: request.method(), language: url.searchParams.get("language") ?? body?.language, status: response.status() });
    await route.fulfill({ response });
  });
  await page.goto(`${origin.origin}/patients/${profilePatientId}/360`);
  await page.getByTestId("patient-ai-summary").waitFor();
  console.log(JSON.stringify({ ready: true, pid: process.pid, port, simulated: true }));
} catch (error) {
  console.error(JSON.stringify({ ready: false, error: error.name }));
  await browser.close();
  process.exitCode = 1;
}
