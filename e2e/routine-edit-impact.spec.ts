import { expect, test } from "@playwright/test";
import { mockRoutineEdit, reviewRoutineEdit } from "./fixtures/routine-edit-http";

for (const usage of [undefined, null, -1, 1.5, "4"]) test(`2.22 · dato ausente/inválido ${JSON.stringify(usage)} no inventa cero`, async ({ page }) => {
  const qa = await mockRoutineEdit(page, { usage });
  const review = await reviewRoutineEdit(page);
  await expect(review.getByText("Uso no disponible", { exact: true })).toBeVisible();
  await expect(review.getByText(/Usada en/)).toHaveCount(0);
  await expect(review.getByRole("heading")).toBeFocused();
  expect(qa.calls).toHaveLength(0);
  await review.getByRole("button", { name: "Volver a editar", exact: true }).click();
  await expect(page.locator("#routine-name")).toHaveValue("Rutina revisada QA");
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(qa.calls).toHaveLength(0); expect(qa.errors).toEqual([]);
});

for (const usage of [0, 1, 27]) test(`2.22 · usageCount sintético ${usage} muestra cifra sin enviar PUT al revisar`, async ({ page }) => {
  const qa = await mockRoutineEdit(page, { usage });
  const review = await reviewRoutineEdit(page);
  await expect(review.getByText(usage === 1 ? "Usada en 1 paciente con semanas activas" : `Usada en ${usage} pacientes con semanas activas`, { exact: true })).toBeVisible();
  await expect(review.getByText("Uso no disponible", { exact: true })).toHaveCount(0);
  await expect(review.getByText("El detalle registrado de las sesiones completadas se conserva.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(qa.calls).toHaveLength(0);
});

test("2.22 · doble confirmación envía un PUT exacto y bloquea cierre mientras guarda", async ({ page }) => {
  const qa = await mockRoutineEdit(page, { usage: 27, delay: 600 });
  const review = await reviewRoutineEdit(page);
  await review.getByRole("button", { name: "Confirmar y guardar", exact: true }).dblclick();
  await expect(review.getByRole("button", { name: "Volver a editar", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(review).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(qa.calls).toHaveLength(1); expect(qa.calls[0].status).toBe(200);
  expect(qa.calls[0].body).toMatchObject({ name: "Rutina revisada QA", exercises: [{ name: "Movimiento QA", mediaId: qa.file.id }] });
  expect(qa.calls[0].body).not.toHaveProperty("usageCount");
  expect(qa.calls[0].body).not.toHaveProperty("patientId");
  expect(qa.errors).toEqual([]);
});

for (const status of ["403", "409", "503"]) test(`2.22 · fallo ${status} conserva cambios y no reintenta automáticamente`, async ({ page }) => {
  const qa = await mockRoutineEdit(page, { usage: 1 }); qa.setMode(status);
  const review = await reviewRoutineEdit(page);
  await review.getByRole("button", { name: "Confirmar y guardar", exact: true }).click();
  await expect(review.getByRole("alert")).toContainText("No se pudo confirmar el guardado");
  expect(qa.calls).toHaveLength(1); expect(qa.calls[0].status).toBe(Number(status));
  await review.getByRole("button", { name: "Volver a editar", exact: true }).click();
  await expect(page.locator("#routine-name")).toHaveValue("Rutina revisada QA");
  expect(qa.calls).toHaveLength(1); expect(qa.errors).toEqual([]);
});

for (const english of [false, true]) test(`2.22 · ${english ? "EN" : "ES"}, teclado y 320/390/1440 sin overflow`, async ({ page }) => {
  const qa = await mockRoutineEdit(page, { usage: 1234, english });
  const review = await reviewRoutineEdit(page, english);
  await expect(review.getByText(english ? "Used by 1,234 patients with active weeks" : "Usada en 1.234 pacientes con semanas activas", { exact: true })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await review.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    // El navegador aplica el nuevo viewport y su layout de forma asíncrona.
    await expect.poll(async () => { const box = await review.boundingBox(); return box !== null && box.x >= 0 && box.x + box.width <= width; }).toBe(true);
  }
  await review.getByRole("button", { name: english ? "Back to editing" : "Volver a editar", exact: true }).press("Enter");
  await expect(page.locator("#routine-name")).toHaveValue("Rutina revisada QA");
  expect(qa.calls).toHaveLength(0); expect(qa.errors).toEqual([]);
});

test("2.22 · lector no puede abrir edición ni confirmar", async ({ page }) => {
  const qa = await mockRoutineEdit(page, { readonly: true });
  await expect(page.getByTitle("Editar", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirmar y guardar", exact: true })).toHaveCount(0);
  expect(qa.calls).toHaveLength(0);
});

test.fixme("2.22 · contrato BACK real: conteo autorizado de pacientes distintos en semanas activas, sin sesiones completadas", async () => {
  // Pendiente SHA/contrato BACK; los valores de usageCount anteriores son sintéticos.
});
