import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mockProfile360Http, profilePatientId } from "./fixtures/profile360-http";

const profileUrl = `/patients/${profilePatientId}/360`;
const readPermissions = ["Patients.View", "Program.Profile360View", "Program.AiView", "Program.View", "Wellness.View", "Nutrition.View", "Nutrition.RecordsView"];
const sim = process.env.E2E_SUMMARY_SIM_URL ?? "http://127.0.0.1:4537";

async function setup(page: Page, options: { mode?: string; manage?: boolean; english?: boolean; noAi?: boolean; delay?: number } = {}) {
  const permissions = options.noAi ? readPermissions.filter(code => code !== "Program.AiView") : [...readPermissions, ...(options.manage ? ["Program.AiManage"] : [])];
  await mockProfile360Http(page, { permissions, english: options.english });
  const calls: { method: string; language: string; body: unknown; status?: number; outcome?: string }[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.name));
  const session = `qa47-${randomUUID()}`;
  await page.route("**/api/v1/program/erp/patients/*/ai-summary*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    const call: (typeof calls)[number] = { method: request.method(), language: url.searchParams.get("language") ?? body?.language ?? "es", body };
    calls.push(call);
    const response = await page.request.fetch(sim + url.pathname + url.search, {
      method: request.method(),
      headers: { "Content-Type": "application/json", "x-mock-slug": "summary-erp", "x-mock-session": session,
        "x-qa-case": options.mode ?? "ok", "x-qa-delay-ms": String(options.delay ?? 0) },
      ...(body ? { data: body } : {}),
    });
    call.status = response.status();
    call.outcome = (await response.json()).status;
    await route.fulfill({ response });
  });
  await page.goto(profileUrl);
  await expect(page.getByRole("tab", { name: options.english ? "Summary" : "Resumen", exact: true })).toBeVisible();
  return { calls, pageErrors, panel: page.getByTestId("patient-ai-summary") };
}

test("4.7 · lector: GET aislado, estimación, modelo, fecha y cita al paciente actual", async ({ page }) => {
  const qa = await setup(page);
  await expect(qa.panel).toContainText("Estimado por IA");
  await expect(qa.panel).toContainText("qa-summary-model");
  await expect(qa.panel).toContainText("UTC");
  await expect(page.getByRole("button", { name: /Generar resumen de IA|Actualizar resumen de IA/ })).toHaveCount(0);
  await expect(qa.panel.getByTestId("patient-ai-summary-text")).toContainText("Se registraron tres comidas");
  await qa.panel.getByRole("button", { name: /Ver fuente \[1\]: Nutrición/ }).first().press("Enter");
  await expect(page.getByRole("tab", { name: "Nutrición", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("patient-ai-source-context")).toContainText(/9.*nov.*2026.*15.*nov.*2026/);
  await expect(page).toHaveURL(new RegExp(profilePatientId));
  expect(qa.calls.every(call => call.method === "GET" && call.language === "es")).toBe(true);
  expect(qa.pageErrors).toEqual([]);
});

test("4.7 · sin AiView no consulta ni muestra contenido o controles de IA", async ({ page }) => {
  const qa = await setup(page, { noAi: true, manage: true });
  await expect(page.getByText("Paciente Perfil QA", { exact: true }).first()).toBeVisible();
  await expect(qa.panel).toHaveCount(0);
  await expect(page.getByTestId("patient-ai-summary-actions")).toHaveCount(0);
  expect(qa.calls).toHaveLength(0);
  await expect(page.getByText("Próximamente", { exact: true })).toHaveCount(0);
});

for (const mode of ["empty", "insufficient", "unavailable", "403", "404", "500", "invalid-estimate", "invalid-language", "invalid-source"]) {
  test(`4.7 · ${mode}: omite el bloque, conserva Perfil 360`, async ({ page }) => {
    const qa = await setup(page, { mode });
    await expect.poll(() => qa.calls.some(call => call.status !== undefined)).toBe(true);
    expect(qa.calls.some(call => call.status === (["403", "404", "500"].includes(mode) ? Number(mode) : 200)
      && (["empty", "insufficient", "unavailable"].includes(mode) ? call.outcome === mode : true))).toBe(true);
    await expect(page.getByTestId("patient-ai-summary-loading")).toHaveCount(0);
    await expect(qa.panel).toHaveCount(0);
    await expect(page.getByText("Paciente Perfil QA", { exact: true }).first()).toBeVisible();
    expect(qa.calls.every(call => call.method === "GET")).toBe(true);
    expect(qa.pageErrors).toEqual([]);
  });
}

test("4.7 · generación explícita, pendiente sin duplicados y GET posterior persistido", async ({ page }) => {
  const qa = await setup(page, { mode: "empty", manage: true, delay: 250 });
  const generate = page.getByRole("button", { name: "Generar resumen de IA", exact: true });
  await expect(generate).toBeVisible();
  expect(qa.calls.filter(call => call.method === "POST")).toHaveLength(0);
  await generate.click();
  await expect(page.getByRole("button", { name: "Generando resumen de IA…", exact: true })).toBeDisabled();
  await expect(qa.panel).toBeVisible();
  await expect(page.getByTestId("patient-ai-generated-at")).toHaveAttribute("datetime", "2026-11-15T17:00:00Z");
  expect(qa.calls.filter(call => call.method === "POST")).toEqual([{ method: "POST", language: "es", body: { language: "es" }, status: 200, outcome: "ok" }]);
  await page.reload();
  await expect(page.getByTestId("patient-ai-generated-at")).toHaveAttribute("datetime", "2026-11-15T17:00:00Z");
  expect(qa.calls.filter(call => call.method === "POST")).toHaveLength(1);
  expect(qa.pageErrors).toEqual([]);
});

for (const mode of ["post-unavailable", "post-insufficient", "post500"]) {
  test(`4.7 · ${mode}: conserva el borrador previo y su fecha sin presentarlo como nuevo`, async ({ page }) => {
    const qa = await setup(page, { mode, manage: true });
    await expect(page.getByTestId("patient-ai-generated-at")).toHaveAttribute("datetime", "2026-11-15T16:00:00Z");
    await page.getByRole("button", { name: "Actualizar resumen de IA", exact: true }).click();
    await expect(page.getByTestId("patient-ai-summary-feedback")).toContainText("Se conserva el resumen anterior con su fecha original.");
    await expect(page.getByTestId("patient-ai-generated-at")).toHaveAttribute("datetime", "2026-11-15T16:00:00Z");
    expect(qa.calls.filter(call => call.method === "POST")).toHaveLength(1);
    expect(qa.pageErrors).toEqual([]);
  });
}

test("4.7 · pérdida de permiso al generar elimina el contenido anterior", async ({ page }) => {
  const qa = await setup(page, { mode: "post403", manage: true });
  await expect(qa.panel).toBeVisible();
  await page.getByRole("button", { name: "Actualizar resumen de IA", exact: true }).click();
  await expect(qa.panel).toHaveCount(0);
  await expect(page.getByTestId("patient-ai-summary-actions")).toHaveCount(0);
  await expect(page.getByText("Paciente Perfil QA", { exact: true }).first()).toBeVisible();
});

test("4.7 · texto hostil se muestra como texto plano y nunca crea HTML o enlaces del modelo", async ({ page }) => {
  const qa = await setup(page, { mode: "hostile-text" });
  await expect(qa.panel).toContainText('<img src=x onerror="window.qaInjected=true">');
  await expect(qa.panel.locator("img, script, a[href*=untrusted]")).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, "qaInjected"))).toBe(false);
});

test("4.7 · modelo nulo no inventa metadatos", async ({ page }) => {
  const qa = await setup(page, { mode: "no-model" });
  await expect(qa.panel).toBeVisible();
  await expect(page.getByTestId("patient-ai-summary-metadata")).not.toContainText("Modelo:");
});

test("4.7 · cambiar idioma vuelve a consultar sin mostrar el borrador del idioma anterior", async ({ page }) => {
  const qa = await setup(page);
  await expect(qa.panel).toContainText("Se registraron tres comidas");
  await page.getByRole("button", { name: "Cambiar idioma a English", exact: true }).click();
  await expect(qa.panel).toContainText("Three meals were recorded");
  await expect(qa.panel).not.toContainText("Se registraron tres comidas");
  expect(qa.calls.some(call => call.language === "en")).toBe(true);
  expect(qa.calls.every(call => call.method === "GET")).toBe(true);
});

for (const english of [false, true]) for (const width of [320, 390, 1440]) {
  test(`4.7 · visual ${english ? "EN" : "ES"} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const qa = await setup(page, { english, manage: true });
    await expect(qa.panel).toBeVisible();
    await expect(qa.panel).toContainText(english ? "Three meals were recorded" : "Se registraron tres comidas");
    await qa.panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const bounds = await qa.panel.boundingBox();
    expect(bounds?.width).toBeLessThanOrEqual(width);
    await qa.panel.screenshot({ path: info.outputPath(`summary-${english ? "en" : "es"}-${width}.png`), animations: "disabled" });
    expect(qa.pageErrors).toEqual([]);
  });
}
