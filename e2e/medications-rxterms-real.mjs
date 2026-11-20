import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const path = process.env.COP_MEDICATION_FIXTURE;
assert.ok(path?.startsWith("/tmp/"), "A private QA fixture is required");
const fixture = JSON.parse(readFileSync(path, "utf8"));
assert.match(fixture.database, /^copp_review_medications_(rxterms|kan75)(_[a-z0-9_]+)?$/);
assert.match(fixture.gateway, /^http:\/\/127\.0\.0\.1:\d+$/);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ locale: "es-CO", timezoneId: "America/Bogota" });
  await page.goto("http://127.0.0.1:3160/login");
  await page.locator("#email").fill(fixture.accounts.manager.login);
  await page.locator("#password").fill(fixture.accounts.manager.password);
  await page.getByRole("slider", { name: "Comencemos", exact: true }).press("End");
  await expect(page).toHaveURL(/dashboard/, { timeout: 60_000 });
  await page.goto("http://127.0.0.1:3160/medications/" + fixture.patientId);
  await page.getByRole("button", { name: "Nuevo tratamiento", exact: true }).click();
  const picker = page.getByRole("combobox", { name: "Buscar en catálogo de EE. UU.", exact: true });
  await expect(picker).toBeFocused();
  const search = picker;
  await search.fill("no-such-drug-" + randomUUID());
  await expect(page.getByText("Sin coincidencias en RxTerms.", { exact: true })).toBeVisible();
  await search.fill("atorvastatin 20");
  await expect(page.getByRole("option").filter({ hasText: /atorvastatin 20 mg/i }).first()).toBeVisible();
  await search.fill("lipitor 20 mg");
  const branded = page.getByRole("option").filter({ hasText: /lipitor/i }).first();
  await expect(branded).toBeVisible({ timeout: 15_000 });
  const name = (await branded.innerText()).trim();
  await branded.click();
  await expect(page.getByLabel("Cantidad por toma")).toHaveValue("");
  await expect(page.getByLabel("Unidad", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Vía", { exact: true })).toHaveValue("");
  await page.getByLabel("Cantidad por toma").fill("1");
  await page.getByLabel("Unidad", { exact: true }).fill("tableta");
  await page.getByLabel("Vía", { exact: true }).fill("oral");
  const save = async () => {
    const posted = page.waitForResponse(response =>
      response.url().endsWith("/treatments") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Guardar tratamiento", exact: true }).click();
    const response = await posted;
    assert.equal(response.status(), 201, await response.text());
    return response.json();
  };
  const refreshed = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/v1/medications/patients/" + fixture.patientId
      && response.request().method() === "GET" && response.ok());
  const selected = await save();
  assert.match(selected.rxCui, /^\d+$/);
  assert.equal(selected.name, name);
  assert.equal(selected.dosage, 1);
  const saved = (await (await refreshed).json()).treatments.find(row => row.id === selected.id);
  assert.equal(saved?.rxCui, selected.rxCui);
  await page.getByRole("tab", { name: "Tratamientos", exact: true }).click();
  await expect(page.locator(".medication-treatment-row").filter({ hasText: name }).first()).toBeVisible();
  await page.getByRole("button", { name: "Nuevo tratamiento", exact: true }).click();
  const manualName = "Producto manual QA " + randomUUID().slice(0, 8);
  await page.getByRole("button", { name: "Entrada manual", exact: true }).click();
  await page.getByLabel("Nombre del producto", { exact: true }).fill(manualName);
  const manual = await save();
  assert.equal(manual.rxCui ?? null, null);
  assert.equal(manual.name, manualName);
  console.log("RxTerms selection, persisted treatment and manual entry passed.");
} finally {
  await browser.close();
}
