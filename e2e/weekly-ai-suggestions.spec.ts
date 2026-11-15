import { test, expect } from "@playwright/test";
import { setupWeeklyAi as setup } from "./fixtures/weekly-ai-http";

test("4.8 · lector consulta sin generar/aplicar y conserva el editor semanal", async ({ page }) => {
  const qa = await setup(page);
  await expect(qa.panel).toContainText("Estimado por IA");
  await expect(qa.panel).toContainText("qa-weekly-model");
  await expect(qa.panel.getByRole("button")).toHaveCount(0);
  expect(qa.calls.every(call => call.method === "GET")).toBe(true);
  expect((await qa.snapshot()).applications).toEqual([]);
  await expect(qa.agenda.getByRole("article")).toHaveCount(7);
  await qa.panel.getByTestId("weekly-ai-suggestion-0").getByTestId("weekly-ai-references").getByRole("link").press("Enter");
  await expect(qa.panel.locator("li[id$='source-0']")).toBeFocused();
  expect(qa.calls.every(call => call.method === "GET")).toBe(true);
  expect(qa.errors).toEqual([]);
});
test("4.8 · AiManage sin Program.Edit sigue siendo lectura", async ({ page }) => {
  const qa = await setup(page, { manage: true, noEdit: true });
  await expect(qa.panel).toBeVisible();
  await expect(page.getByTestId("weekly-ai-actions")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Revisar cambio", exact: true })).toHaveCount(0);
});
test("4.8 · sin AiView no consulta ni revela sugerencias", async ({ page }) => {
  const qa = await setup(page, { manage: true, noView: true });
  await expect(qa.agenda.getByRole("article")).toHaveCount(7);
  await expect(qa.panel).toHaveCount(0);
  expect(qa.calls).toEqual([]);
});
for (const mode of ["empty", "insufficient", "unavailable", "403", "404", "500", "invalid"]) test(`4.8 · ${mode}: conserva agenda manual`, async ({ page }) => {
  const qa = await setup(page, { mode });
  await expect.poll(() => qa.calls.some(call => call.status !== undefined)).toBe(true);
  expect(qa.calls.some(call => call.status === (["403", "404", "500"].includes(mode) ? Number(mode) : 200))).toBe(true);
  await expect(page.getByTestId("weekly-ai-suggestions-loading")).toHaveCount(0);
  await expect(qa.panel).toHaveCount(0);
  await expect(qa.agenda.getByRole("article")).toHaveCount(7);
  expect((await qa.snapshot()).applications).toEqual([]);
  expect(qa.errors).toEqual([]);
});
test("4.8 · cancelar no aplica; confirmar una vez personaliza solo una celda y recarga el borrador", async ({ page }) => {
  const qa = await setup(page, { manage: true, delay: 150 });
  const before = (await qa.snapshot()).week;
  await qa.panel.getByTestId("weekly-ai-suggestion-0").getByRole("button", { name: "Revisar cambio" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Aplicar sugerencia al plan" });
  await expect(confirm.getByText("Rutina A QA", { exact: true })).toBeVisible();
  await expect(confirm.getByText("Rutina B QA", { exact: true })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  expect((await qa.snapshot()).applications).toEqual([]);
  await qa.panel.getByTestId("weekly-ai-suggestion-0").getByRole("button", { name: "Revisar cambio" }).click();
  await confirm.getByRole("button", { name: "Confirmar y aplicar", exact: true }).click();
  await expect(confirm.getByRole("button", { name: "Aplicando sugerencia…", exact: true })).toBeDisabled();
  await expect(qa.panel.getByTestId("weekly-ai-suggestion-0")).toContainText("Aplicada");
  const after = await qa.snapshot();
  expect(after.applications).toHaveLength(1);
  expect(qa.calls.filter(c => c.method === "POST").map(c => c.body)).toEqual([{ confirmed: true }]);
  const changed = structuredClone(before); changed.days[0].tasks[0] = { ...changed.days[0].tasks[0], contentRefId: qa.http.routineB, contentName: "Rutina B QA", source: "individual" };
  expect(after.week).toEqual(changed);
  await expect(qa.agenda.getByRole("article").first()).toContainText("Personalizado");
  await expect(qa.panel.getByTestId("weekly-ai-suggestion-1").getByRole("button", { name: "Revisar cambio" })).toBeEnabled();
  expect(qa.errors).toEqual([]);
});
test("4.8 · generación explícita no aplica y mantiene fecha tras consultar", async ({ page }) => {
  const qa = await setup(page, { manage: true, mode: "empty" });
  await page.getByRole("button", { name: "Generar sugerencias de IA", exact: true }).click();
  await expect(qa.panel).toBeVisible();
  expect(qa.calls.filter(c => c.method === "POST").map(c => c.body)).toEqual([{ language: "es" }]);
  expect((await qa.snapshot()).applications).toEqual([]);
  await expect(page.getByTestId("weekly-ai-generated-at")).toHaveAttribute("datetime", "2026-11-15T17:00:00Z");
});
for (const mode of ["post-unavailable", "post-insufficient"]) test(`4.8 · ${mode} conserva fecha del borrador previo`, async ({ page }) => {
  const qa = await setup(page, { manage: true, mode });
  await expect(qa.panel).toBeVisible();
  await qa.panel.getByRole("button", { name: "Regenerar sugerencias de IA" }).click();
  await expect(page.getByTestId("weekly-ai-feedback")).toBeVisible();
  await expect(page.getByTestId("weekly-ai-generated-at")).toHaveAttribute("datetime", "2026-11-15T16:00:00Z");
  expect((await qa.snapshot()).applications).toEqual([]);
});
for (const mode of ["apply409", "apply422", "apply500", "commit500"]) test(`4.8 · ${mode} exige consultar antes de aplicar de nuevo`, async ({ page }) => {
  const qa = await setup(page, { manage: true, mode });
  await qa.panel.getByTestId("weekly-ai-suggestion-0").getByRole("button", { name: "Revisar cambio" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Confirmar y aplicar" }).click();
  await expect(confirm.getByRole("button", { name: "Confirmar y aplicar" })).toBeDisabled();
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(qa.panel.getByTestId("weekly-ai-suggestion-0").getByRole("button", { name: "Revisar cambio" })).toBeDisabled();
  expect(qa.calls.filter(c => c.path.endsWith("/apply"))).toHaveLength(1);
  await qa.panel.getByRole("button", { name: "Volver a consultar sugerencias" }).click();
  await expect(qa.panel).toBeVisible();
  const snapshot = await qa.snapshot(); expect(snapshot.applications).toHaveLength(mode === "commit500" ? 1 : 0);
  if (mode === "commit500") { await expect(qa.panel.getByTestId("weekly-ai-suggestion-0")).toContainText("Aplicada"); await expect(qa.agenda.getByRole("article").first()).toContainText("Personalizado"); }
});
test("4.8 · borrador stale no permite aplicar", async ({ page }) => {
  const qa = await setup(page, { manage: true, mode: "stale" });
  await expect(qa.panel.getByRole("button", { name: "Revisar cambio" }).first()).toBeDisabled();
  expect((await qa.snapshot()).applications).toEqual([]);
});
test("4.8 · descanso respeta el interruptor y no se aplica automáticamente", async ({ page }) => {
  const qa = await setup(page, { manage: true, mode: "rest" });
  const item = qa.panel.getByTestId("weekly-ai-suggestion-0");
  await expect(item).toContainText("Descanso");
  if (process.env.E2E_REST_ENABLED !== "true") await expect(item.getByRole("button", { name: "Revisar cambio" })).toBeDisabled();
  expect((await qa.snapshot()).applications).toEqual([]);
});
for (const mode of ["apply403", "apply404"]) test(`4.8 · ${mode} oculta contenido y controles de IA`, async ({ page }) => {
  const qa = await setup(page, { manage: true, mode });
  await qa.panel.getByTestId("weekly-ai-suggestion-0").getByRole("button", { name: "Revisar cambio" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar y aplicar" }).click();
  await expect(qa.panel).toHaveCount(0);
  await expect(qa.agenda.getByRole("article")).toHaveCount(7);
  expect((await qa.snapshot()).applications).toEqual([]);
});
test("4.8 · el texto hostil no crea HTML ni navegación externa", async ({ page }) => {
  const qa = await setup(page, { mode: "hostile" });
  await expect(qa.panel).toContainText('<img src=x onerror="window.qaInjected=true">');
  await expect(qa.panel.locator("img, script, a[href*=untrusted]")).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, "qaInjected"))).toBe(false);
});
for (const english of [false, true]) for (const width of [320, 390, 1440]) test(`4.8 · visual ${english ? "EN" : "ES"} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const qa = await setup(page, { manage: true, english });
  await expect(qa.panel).toBeVisible();
  await expect(qa.panel.getByText(english ? "Estimated by AI" : "Estimado por IA", { exact: true })).toBeVisible();
  await qa.panel.screenshot({ path: info.outputPath("suggestions.png"), animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(await qa.panel.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await qa.panel.getByTestId("weekly-ai-suggestion-0").getByRole("button", { name: english ? "Review change" : "Revisar cambio" }).click();
  const dialog = page.getByRole("alertdialog"); await expect(dialog).toBeVisible();
  await expect(dialog.getByText(english ? "Estimated by AI" : "Estimado por IA", { exact: true })).toBeVisible();
  await dialog.screenshot({ path: info.outputPath("confirmation.png"), animations: "disabled" });
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(width);
  expect(qa.errors).toEqual([]);
});
