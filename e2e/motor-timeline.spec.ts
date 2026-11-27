import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { foreignProfilePatientId, mockProfile360Http, profilePatientId } from "./fixtures/profile360-http";

const profile = `/patients/${profilePatientId}/360`;
const timeline = `${profile}/motor-timeline`;
const api = `**/api/v1/program/erp/patients/${profilePatientId}/motor-timeline`;
const example = {
  id: "086946a7-0ce9-4ccf-a07c-caaa771a184a",
  day: 14, kind: "ajuste", occurredAt: "2026-11-12T14:00:00Z", planVersion: 8,
  parametersVersion: 2, engineVersion: "v5.2", calorieDelta: -80, ratePercent: null,
  messageEs: "Ajuste según la adherencia registrada.", messageEn: "Adjustment based on recorded adherence.",
};

test("abre la bitácora del Perfil 360 y exporta solo la selección filtrada", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await mockProfile360Http(page, { permissions: ["Patients.View", "Program.Profile360View", "Program.Export"] });
  const queries: URLSearchParams[] = [];
  await page.route(`${api}?*`, route => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query);
    const filtered = query.get("kind") === "ajuste";
    return route.fulfill({ json: {
      events: filtered ? [example] : [example, {
        ...example, id: "6c2ecbf4-dc5a-4a94-86bc-a9e1d766ef00", day: 10,
        kind: "modo", occurredAt: "2026-10-08T14:00:00Z", messageEs: "Cambio de fase QA.",
      }],
      page: 1, hasNext: false,
    } });
  });
  const exported: URLSearchParams[] = [];
  await page.route(`${api}/export?*`, route => {
    expect(route.request().method()).toBe("POST");
    exported.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ contentType: "text/csv; charset=utf-8", body: `"ID","Event"\n"${example.id}","ajuste"\n` });
  });
  await page.goto(profile);
  await page.getByRole("link", { name: "Bitácora del Motor 365" }).click();
  await expect(page).toHaveURL(timeline);
  await expect(page.getByRole("heading", { name: "Bitácora del Motor 365" })).toBeVisible();
  await expect(page.getByText("Cambio de fase QA.")).toBeVisible();
  await expect(page.getByText("Ajuste según la adherencia registrada.")).toBeVisible();
  await page.getByLabel("Desde (UTC)").fill("2026-11-01");
  await page.getByLabel("Hasta (UTC)").fill("2026-11-30");
  await page.getByLabel("Tipo de evento").selectOption("ajuste");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByText("Cambio de fase QA.")).toHaveCount(0);
  await expect(page.getByText("Ajuste según la adherencia registrada.")).toBeVisible();
  expect(Object.fromEntries(queries.at(-1)!)).toMatchObject({ from: "2026-11-01", to: "2026-11-30", kind: "ajuste", page: "1" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("motor-365-events.csv");
  expect(await readFile((await download.path())!, "utf8")).toContain(example.id);
  expect(Object.fromEntries(exported[0])).toMatchObject({ from: "2026-11-01", to: "2026-11-30", kind: "ajuste", lang: "es" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("traduce explicación, pagina y no ofrece exportación al perfil de solo lectura", async ({ page }) => {
  await mockProfile360Http(page, { english: true, permissions: ["Patients.View", "Program.Profile360View"] });
  await page.route(`${api}?*`, route => {
    const next = new URL(route.request().url()).searchParams.get("page") === "2";
    return route.fulfill({ json: {
      events: next ? [{ ...example, messageEn: "Previous decision QA." }] : [example],
      page: next ? 2 : 1, hasNext: !next,
    } });
  });
  await page.goto(timeline);
  await expect(page.getByText("Adjustment based on recorded adherence.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CSV" })).toHaveCount(0);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Previous decision QA.")).toBeVisible();
  await expect(page.getByText("Adjustment based on recorded adherence.")).toHaveCount(0);
});

test("rechaza el perfil ajeno y no presenta ningún historial", async ({ page }) => {
  await mockProfile360Http(page);
  await page.goto(`/patients/${foreignProfilePatientId}/360/motor-timeline`);
  await expect(page.getByRole("alert").filter({ hasText: "No tienes acceso a la bitácora de esta persona." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Descargar CSV" })).toHaveCount(0);
});
