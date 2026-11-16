import { test, expect } from "@playwright/test";
import { openPatientRoutines, routine221, setupPatientRoutines } from "./fixtures/patient-routines-http";
import { patientWorkspaceRows } from "./fixtures/patients-http";

test("2.21 · revisar/cancelar no escribe; confirmar una vez muestra resultado agregado real", async ({ page }) => {
  const qa = await setupPatientRoutines(page, { delay: 500 });
  let dialog = await openPatientRoutines(page);
  await expect(dialog.getByRole("button", { name: "Revisar asignación", exact: true })).toBeDisabled();
  await dialog.getByRole("radio").first().check();
  await expect(dialog.getByText("Borrador no seleccionable")).toHaveCount(0);
  await dialog.getByLabel("Desde la semana", { exact: true }).selectOption("4");
  await dialog.getByLabel("Hasta la semana", { exact: true }).selectOption("2");
  await expect(dialog.getByRole("alert").filter({ hasText: "La semana final" })).toBeVisible();
  await dialog.getByLabel("Desde la semana", { exact: true }).selectOption("2");
  await dialog.getByLabel("Hasta la semana", { exact: true }).selectOption("12");
  await dialog.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  await expect(page.getByText(/Se sustituye el ejercicio y se retira el descanso/)).toBeVisible();
  expect(qa.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Asignar rutina", exact: true })).toBeFocused();
  expect(qa.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Asignar rutina", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("radio").first().check();
  await dialog.getByLabel("Desde la semana", { exact: true }).selectOption("2");
  await dialog.getByLabel("Hasta la semana", { exact: true }).selectOption("12");
  await dialog.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar y asignar", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Resultado de la asignación", exact: true })).toBeVisible();
  expect(qa.calls).toEqual([{ body: { patientIds: patientWorkspaceRows.slice(0, 2).map(p => p.patientId), routineId: routine221.id, semanaDesde: 2, semanaHasta: 12 }, status: 200 }]);
  await expect(page.getByText("Los conteos de aplicados y semanas iniciadas pueden incluir al mismo paciente.")).toBeVisible();
  await expect(page.getByRole("dialog").getByText(patientWorkspaceRows[1].patientId, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(qa.unknowns).toEqual([]); expect(qa.errors).toEqual([]);
});

for (const mode of ["inactive", "enrollment", "range", "conflict", "forbidden", "server", "invalid"]) test(`2.21 · ${mode} conserva selección/rango y exige revisar otra vez`, async ({ page }) => {
  const qa = await setupPatientRoutines(page); qa.setMode(mode);
  const dialog = await openPatientRoutines(page);
  await dialog.getByRole("radio").first().check();
  await dialog.getByLabel("Desde la semana", { exact: true }).selectOption("2");
  await dialog.getByLabel("Hasta la semana", { exact: true }).selectOption("3");
  await dialog.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar y asignar", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Asignar rutina en bloque", exact: true });
  await expect(edit).toBeVisible();
  await expect(edit.getByRole("alert").last()).toBeVisible();
  await expect(edit.getByLabel("Desde la semana", { exact: true })).toHaveValue("2");
  expect(qa.calls).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Confirmar y asignar", exact: true })).toHaveCount(0);
  expect(qa.errors).toEqual([]); expect(qa.unknowns).toEqual([]);
});

test("2.21 · catálogo: fallo/reintento, búsqueda vacía y paginación conservan elección", async ({ page }) => {
  const qa = await setupPatientRoutines(page); qa.setCatalogFail(true);
  await page.getByRole("row").filter({ hasText: patientWorkspaceRows[0].firstName }).getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Asignar rutina", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert").first()).toContainText("No se pudieron cargar las rutinas");
  qa.setCatalogFail(false); await dialog.getByRole("button", { name: "Reintentar", exact: true }).click();
  await dialog.getByRole("radio").first().check();
  await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(dialog.getByRole("radio").first()).toHaveAccessibleName(/Rutina de recuperación/);
  await dialog.getByLabel("Buscar rutina", { exact: true }).fill("ninguna");
  await expect(dialog.getByText("No hay rutinas activas para esta búsqueda.")).toBeVisible();
  await expect(dialog.getByText("Rutina seleccionada: " + routine221.name)).toBeVisible();
  expect(qa.catalogCalls.every(c => c.status === "Active")).toBe(true); expect(qa.calls).toHaveLength(0);
});

test("2.21 · Director conserva pacientes entre páginas y muestra cero aplicaciones si todas se omiten", async ({ page }) => {
  const qa = await setupPatientRoutines(page, { role: "ClinicalDirector" }); qa.setMode("all-started");
  for (const index of [0, 10]) {
    if (index === 10) await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await page.getByRole("row").filter({ hasText: patientWorkspaceRows[index].firstName + " " + patientWorkspaceRows[index].lastName }).getByRole("checkbox").first().check();
  }
  await page.getByRole("button", { name: "Asignar rutina", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("La selección incluye pacientes de otras páginas o filtros.")).toBeVisible();
  await dialog.getByRole("radio").first().check();
  await dialog.getByLabel("Desde la semana", { exact: true }).selectOption("1");
  await dialog.getByLabel("Hasta la semana", { exact: true }).selectOption("1");
  await dialog.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar y asignar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Resultado de la asignación", exact: true })).toBeVisible();
  expect(qa.calls).toEqual([{ body: { patientIds: [patientWorkspaceRows[0].patientId, patientWorkspaceRows[10].patientId], routineId: routine221.id, semanaDesde: 1, semanaHasta: 1 }, status: 200 }]);
  await expect(page.getByRole("definition").nth(0)).toHaveText("0");
  await expect(page.getByRole("definition").nth(1)).toHaveText("2");
});

for (const options of [{ role: "Professional" }, { role: "ClinicalDirector", noEdit: true }]) test(`2.21 · permiso ${JSON.stringify(options)} no ofrece acción ni catálogo`, async ({ page }) => {
  const qa = await setupPatientRoutines(page, options);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Asignar rutina", exact: true })).toHaveCount(0);
  expect(qa.catalogCalls).toHaveLength(0); expect(qa.calls).toHaveLength(0);
});

for (const english of [false, true]) test(`2.21 · ${english ? "EN" : "ES"} responsive, teclado y privacidad del resultado`, async ({ page }) => {
  const qa = await setupPatientRoutines(page, { english }); qa.setMode("foreign-extra");
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openPatientRoutines(page, english);
  await dialog.getByRole("radio").first().focus(); await page.keyboard.press("Space");
  await dialog.getByLabel(english ? "From week" : "Desde la semana", { exact: true }).selectOption("2");
  await dialog.getByLabel(english ? "To week" : "Hasta la semana", { exact: true }).selectOption("3");
  await dialog.getByRole("button", { name: english ? "Review assignment" : "Revisar asignación", exact: true }).click();
  await page.getByRole("button", { name: english ? "Confirm and assign" : "Confirmar y asignar", exact: true }).press("Enter");
  await expect(page.getByRole("dialog", { name: english ? "Assignment result" : "Resultado de la asignación", exact: true })).toBeVisible();
  await expect(page.getByText("NO-ENVIADO", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(qa.calls).toHaveLength(1); expect(qa.errors).toEqual([]);
});
