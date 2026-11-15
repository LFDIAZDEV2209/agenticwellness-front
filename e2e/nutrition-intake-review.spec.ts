import { test, expect, type Page } from "@playwright/test";
import { mockIntakeReviewHttp } from "./fixtures/nutrition-review-http";
import { intakePatient, intakeToday } from "./fixtures/nutrition-intake-http";

test.use({ timezoneId: "Asia/Tokyo" });
async function open(page: Page) {
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  await page.getByRole("button", { name: /^Día 33 ·/ }).click();
  await detail(page).getByRole("button", { name: /^Almuerzo/ }).click();
}
const detail = (page: Page) =>
  page.getByRole("region", { name: "Detalle del día", exact: true });
const meals = (page: Page) =>
  detail(page).locator(".nutrition-intake-meals > li");
const counter = (page: Page) =>
  page.getByRole("status", {
    name: "Días pendientes de revisión",
    exact: true,
  });

test("3.15 · filtros combinables, mealCode exacto y desvío calórico solo informativo", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page);
  await open(page);
  await expect(meals(page)).toHaveCount(3);
  await expect(counter(page)).toContainText("7 días sin revisar");
  await expect(detail(page)).toContainText(
    "Desvío respecto al menú: +192 kcal",
  );
  await page
    .getByRole("checkbox", { name: "Fuera del plan", exact: true })
    .check();
  await expect(meals(page)).toHaveCount(1);
  await expect(meals(page)).toContainText("Cena");
  await expect(meals(page)).not.toContainText("Almuerzo");
  await page.getByRole("checkbox", { name: "Con foto", exact: true }).check();
  await expect(
    page.getByText(
      "No hay registros que coincidan en los días cargados. Prueba otros filtros o cambia la ventana de continuidad.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Limpiar filtros", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Tipo de comida", exact: true })
    .selectOption("alm");
  await expect(meals(page)).toHaveCount(1);
  await expect(meals(page)).toContainText("Almuerzo");
  await page.getByRole("checkbox", { name: "Con foto", exact: true }).check();
  await expect(meals(page)).toHaveCount(1);
  expect(http.state.writes).toEqual([]);
});

test("3.15 · marcar, contador global, refrescar y deshacer con las rutas reales 3.8a", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page);
  await open(page);
  await page
    .getByRole("button", { name: "Marcar día como revisado", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deshacer revisión", exact: true }),
  ).toBeEnabled();
  await expect(counter(page)).toContainText("6 días sin revisar");
  await page.reload();
  await page.getByRole("button", { name: /^Día 33 ·/ }).click();
  await expect(
    page.getByRole("button", { name: "Deshacer revisión", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Deshacer revisión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Marcar día como revisado", exact: true }),
  ).toBeEnabled();
  await expect(counter(page)).toContainText("7 días sin revisar");
  expect(http.state.writes.map((write) => [write.method, write.path])).toEqual([
    [
      "POST",
      `/api/v1/nutrition/cycles/synthetic-cycle/days/${intakeToday}/review`,
    ],
    [
      "DELETE",
      `/api/v1/nutrition/cycles/synthetic-cycle/days/${intakeToday}/review`,
    ],
  ]);
});

test("3.15 · corrección posterior reabre el día; el filtro sigue la lectura del servidor", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page);
  http.state.reviews.add(intakeToday);
  await open(page);
  await expect(
    page.getByRole("button", { name: "Deshacer revisión", exact: true }),
  ).toBeEnabled();
  http.state.modified.add(intakeToday);
  http.state.count++;
  await page
    .getByRole("button", { name: "Actualizar registros", exact: true })
    .click();
  await expect(detail(page)).toContainText("Modificado tras tu revisión");
  await page
    .getByRole("checkbox", { name: "Sin revisar", exact: true })
    .check();
  await expect(detail(page)).toContainText("920 kcal");
  await page
    .getByRole("button", { name: "Volver a marcar como revisado", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deshacer revisión", exact: true }),
  ).toBeEnabled();
  await expect(detail(page)).not.toContainText("Modificado tras tu revisión");
});

test("3.15 · doble pulsación bloqueada y error de escritura no marca el día", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page);
  http.state.delayed = true;
  await open(page);
  const mark = page.getByRole("button", {
    name: "Marcar día como revisado",
    exact: true,
  });
  await mark.click();
  await expect(
    page.getByRole("button", { name: "Guardando revisión…", exact: true }),
  ).toBeDisabled();
  expect(http.state.writes).toHaveLength(1);
  http.state.failWrite = true;
  http.state.release();
  await expect(
    page.getByRole("alert", { name: "No se guardó la revisión", exact: true }),
  ).toBeVisible();
  await expect(mark).toBeEnabled();
  expect(http.state.reviews.has(intakeToday)).toBe(false);
  await expect(counter(page)).toContainText("7 días sin revisar");
  http.state.delayed = false;
  http.state.failWrite = false;
  await page
    .getByRole("button", { name: "Actualizar estado", exact: true })
    .click();
  await mark.click();
  await expect(
    page.getByRole("button", { name: "Deshacer revisión", exact: true }),
  ).toBeEnabled();
});

test("3.15 · revisión ausente o malformada no se inventa; contador desconocido no es cero", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page, { missingCount: true });
  http.state.badReviews = true;
  await open(page);
  await expect(
    page.getByRole("button", { name: "Marcar día como revisado", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Sin revisar", exact: true }),
  ).toBeDisabled();
  await expect(counter(page)).toContainText(
    "El contador de revisión no está disponible.",
  );
  await expect(counter(page)).not.toContainText("0 días");
  await expect(meals(page)).toHaveCount(3);
  http.state.badReviews = false;
  await page
    .getByRole("button", { name: "Reintentar revisión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Marcar día como revisado", exact: true }),
  ).toBeEnabled();
});

test("3.15 · coordinación lee estados, sin fotos, escrituras ni notas", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page, {
    readonly: true,
    noPhotos: true,
  });
  await open(page);
  await expect(
    page.getByRole("checkbox", { name: "Con foto", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Marcar día como revisado", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Anclar como ejemplo", exact: true }),
  ).toHaveCount(0);
  expect(http.state.writes).toEqual([]);
  expect(http.intakeState.photoRequests).toBe(0);
  expect(http.state.reads.some((path) => path.includes("__synthetic__"))).toBe(
    false,
  );
});

test("3.15 · fallo de revisión con filtro activo no equivale a cero coincidencias", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page);
  await open(page);
  await page
    .getByRole("checkbox", { name: "Sin revisar", exact: true })
    .check();
  await expect(meals(page)).toHaveCount(3);
  http.state.failRead = true;
  await page
    .getByRole("button", { name: "Actualizar registros", exact: true })
    .click();
  await expect(detail(page)).toContainText(
    "El filtro sin revisar está pendiente de una lectura válida.",
  );
  await expect(detail(page)).not.toContainText(
    "Este día no tiene comidas que coincidan",
  );
  http.state.failRead = false;
  await page
    .getByRole("button", { name: "Reintentar revisión", exact: true })
    .click();
  await expect(meals(page)).toHaveCount(3);
});

test("3.15 · origen clínico falsificado se rechaza según 3.7 real", async ({
  page,
}) => {
  await mockIntakeReviewHttp(page, { badOrigin: true });
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  await expect(
    page.getByRole("alert", {
      name: "No pudimos cargar los registros de comidas",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "30 días del ciclo", exact: true }),
  ).toHaveCount(0);
});

test("3.15 · highlights ausente no ofrece anclado ficticio", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page, { missingHighlights: true });
  await open(page);
  await expect(
    page.getByRole("button", { name: "Anclar como ejemplo", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Ejemplo para el cierre", exact: true }),
  ).toContainText(
    "No hay una lectura válida de ejemplos. Actualiza antes de guardar.",
  );
  expect(http.state.reads.some((path) => path.includes("__synthetic__"))).toBe(
    false,
  );
  expect(http.state.writes).toEqual([]);
});

test("3.15 · filtros accesibles a 320 px sin desborde", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mockIntakeReviewHttp(page);
  await open(page);
  const outside = page.getByRole("checkbox", {
    name: "Fuera del plan",
    exact: true,
  });
  await outside.focus();
  await page.keyboard.press("Space");
  await expect(outside).toBeChecked();
  await expect(meals(page)).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("3.15 · revisión, contador y filtros en inglés", async ({ page }) => {
  await mockIntakeReviewHttp(page, { english: true });
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  await page.getByRole("button", { name: /^Day 33 ·/ }).click();
  await expect(
    page.getByRole("status", { name: "Days awaiting review", exact: true }),
  ).toContainText("7 unreviewed days");
  await page
    .getByRole("button", { name: "Mark day as reviewed", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo review", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("checkbox", { name: "Outside the plan", exact: true })
    .check();
  await expect(
    page
      .getByRole("region", { name: "Day details", exact: true })
      .locator(".nutrition-intake-meals > li"),
  ).toHaveCount(1);
});

test("3.15 · sin ciclo publicado mantiene lectura sin inventar revisión diaria", async ({
  page,
}) => {
  const http = await mockIntakeReviewHttp(page, { noCycle: true });
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  await expect(
    page.getByRole("heading", {
      name: "Últimos 30 días · sin ciclo publicado",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Sin revisar", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Marcar día como revisado", exact: true }),
  ).toBeDisabled();
  await expect(meals(page)).toHaveCount(3);
  expect(http.state.reads.some((path) => path.includes("/days/reviews"))).toBe(
    false,
  );
});
