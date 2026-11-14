import { test, expect, type Page } from "@playwright/test";
import { mockIntakeReviewHttp } from "./fixtures/nutrition-review-http";
import { intakePatient, intakeToday } from "./fixtures/nutrition-intake-http";

/** 3.8b real (19acc16); todas las respuestas y escrituras son HTTP sintético. */
async function open(page: Page) {
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  await page.getByRole("button", { name: /^Día 33 ·/ }).click();
}
const recordId = `${intakeToday}-synthetic-alm`;

test("3.15 · encuentra un ejemplo de la segunda página antes de permitir anclar", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page);
  http.state.extraHighlights = 100;
  http.state.highlights.set(recordId, "Ejemplo de página dos");
  await open(page);
  await expect(
    page.getByRole("button", { name: "Quitar ejemplo anclado", exact: true }),
  ).toBeEnabled();
  expect(http.state.highlightPages).toEqual(expect.arrayContaining([1, 2]));
  await expect(
    page.getByRole("region", { name: "Ejemplo para el cierre", exact: true }),
  ).toContainText("Ejemplo de página dos");
});

test("3.15 · anclar nota, recargar, conservar tras corrección y quitar con 3.8b", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page);
  await open(page);
  await page
    .getByRole("textbox", {
      name: "Nota interna del ejemplo (opcional)",
      exact: true,
    })
    .fill("Porción revisada con el paciente");
  await page
    .getByRole("button", { name: "Anclar como ejemplo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Quitar ejemplo anclado", exact: true }),
  ).toBeEnabled();
  expect(http.state.highlights.get(recordId)).toBe(
    "Porción revisada con el paciente",
  );
  await page.reload();
  await page.getByRole("button", { name: /^Día 33 ·/ }).click();
  await expect(
    page.getByRole("region", { name: "Ejemplo para el cierre", exact: true }),
  ).toContainText("Porción revisada con el paciente");
  http.state.modified.add(intakeToday);
  await page
    .getByRole("button", { name: "Actualizar registros", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Quitar ejemplo anclado", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("complementary", {
      name: "Detalle de la comida",
      exact: true,
    }),
  ).toContainText("920 kcal");
  await page
    .getByRole("button", { name: "Quitar ejemplo anclado", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Anclar como ejemplo", exact: true }),
  ).toBeEnabled();
  expect(http.state.highlights.has(recordId)).toBe(false);
  expect(
    http.state.writes
      .filter((write) => write.path.includes("/highlights/"))
      .map((write) => write.method),
  ).toEqual(["POST", "DELETE"]);
  expect(
    http.state.writes.every((write) =>
      write.path.startsWith("/api/v1/nutrition/cycles/"),
    ),
  ).toBe(true);
});

test("3.15 · error no muestra ejemplo guardado y reintento es explícito", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page);
  http.state.failPin = true;
  await open(page);
  await page
    .getByRole("button", { name: "Anclar como ejemplo", exact: true })
    .click();
  await expect(
    page.getByRole("alert", { name: "No se guardó el ejemplo", exact: true }),
  ).toBeVisible();
  expect(http.state.highlights.size).toBe(0);
  http.state.failPin = false;
  await page
    .getByRole("button", { name: "Actualizar ejemplos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Anclar como ejemplo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Quitar ejemplo anclado", exact: true }),
  ).toBeEnabled();
});

test("3.15 · coordinación no ve nota ni puede anclar", async ({ page }) => {
  const http = await mockIntakeReviewHttp(page, {
    readonly: true,
    noPhotos: true,
  });
  http.state.highlights.set(recordId, "Nota interna reservada");
  await open(page);
  await expect(
    page.getByRole("region", { name: "Ejemplo para el cierre", exact: true }),
  ).toContainText("Ejemplo anclado");
  await expect(
    page.getByText("Nota interna reservada", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Quitar ejemplo anclado", exact: true }),
  ).toHaveCount(0);
  expect(http.state.writes).toEqual([]);
});

test("3.15 · anclado y controles a 320px sin desborde, teclado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mockIntakeReviewHttp(page);
  await open(page);
  const pin = page.getByRole("button", {
    name: "Anclar como ejemplo",
    exact: true,
  });
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Quitar ejemplo anclado", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
