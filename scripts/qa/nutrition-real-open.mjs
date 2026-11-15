import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readQaPassword } from "../../e2e/helpers/nutrition-real-credentials.mjs";

// Puente CDP local para Playwright MCP: login UI real sin pasar secretos al tool.
const fixture = JSON.parse(readFileSync(process.argv[2], "utf8"));
const port = Number(process.argv[3] ?? 9236);
if (!Number.isInteger(port) || port < 9200 || port > 9299) throw new Error("Puerto CDP QA inválido.");
const origin = new URL(process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5182");
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error("Solo APP local.");
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"] });
// No forzar process.exit al desconectar: Playwright debe recoger su proceso hijo.
process.on("SIGINT", () => void browser.close());
process.on("SIGTERM", () => void browser.close());
try {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 900 }, locale: "es-CO", timezoneId: "America/Bogota" });
  const page = await context.newPage();
  const account = fixture.accounts.patient;
  await page.goto(origin.origin);
  await page.locator("#login-id input").fill(account.documentNumber);
  await page.locator("#login-password input").fill(readQaPassword(account.credentialTarget));
  await page.getByRole("button", { name: "Comencemos", exact: true }).click();
  await page.locator("nav.bnav").getByRole("button", { name: "Nutrición", exact: true }).click();
  await page.getByTestId("nutrition-tab-plan").waitFor();
  console.log(JSON.stringify({ ready: true, pid: process.pid, port, apiInterception: false }));
} catch {
  console.error("No se pudo abrir la APP real para QA; no se imprimen credenciales ni respuestas de auth.");
  await browser.close();
  process.exitCode = 1;
}
