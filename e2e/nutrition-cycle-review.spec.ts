import { test, expect, type Page } from "@playwright/test";
import {
  mockCycleReviewHttp,
  reviewCycleId,
} from "./fixtures/nutrition-cycle-review-http";
import { intakePatient, intakeToday } from "./fixtures/nutrition-intake-http";

test.use({ timezoneId: "Asia/Tokyo" });
const summary = (page: Page) =>
  page.getByRole("region", { name: "Resumen del período", exact: true });
const comparison = (page: Page) =>
  page.getByRole("region", {
    name: "Comparación con el ciclo anterior",
    exact: true,
  });
const records = (page: Page) =>
  page.getByRole("region", { name: "Registros y ejemplos", exact: true });
const gallery = (page: Page) =>
  records(page).getByRole("list", { name: "Registros del período" });
async function open(page: Page) {
  await page.goto(`/nutrition/${intakePatient}?tab=cierre`);
  await expect(summary(page)).toBeVisible();
}

test("3.16 · entrada desde ficha, resumen real y siguiente etapa sin IA ni escritura", async ({
  page,
}) => {
  const http = await mockCycleReviewHttp(page);
  const commands: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/nutrition/"))
      commands.push(r.url());
  });
  await page.goto(`/nutrition/${intakePatient}?tab=resultados`);
  await page
    .getByRole("button", { name: "Revisar ciclo", exact: true })
    .click();
  await expect(summary(page)).toContainText("3 de 33");
  await expect(summary(page).locator(".nutrition-review-stats")).toContainText(
    "64 %",
  );
  await expect(summary(page).locator(".nutrition-review-stats")).toContainText(
    "1.350 kcal",
  );
  await expect(summary(page)).toContainText("2 días con valor conocido");
  await expect(summary(page)).toContainText("30 días de interrupción");
  await expect(summary(page)).toContainText(
    "Media conjunta de registros estimados por IA y confirmados por el paciente",
  );
  await expect(
    summary(page).locator(".nutrition-review-origins"),
  ).toContainText("1.600 kcal");
  await expect(
    summary(page).locator(".nutrition-review-origins"),
  ).toContainText("1.100 kcal");
  await expect(
    page.getByRole("button", { name: "Generar borrador de IA", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", {
      name: "Evaluación interna (obligatoria para publicar)",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/tab=cierre/);
  expect(commands).toEqual([]);
  expect(http.state.writes).toEqual([]);
  await page
    .getByRole("button", { name: "Volver a la ficha", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revisar ciclo", exact: true }),
  ).toBeVisible();
});

test("3.16 · comparación con fechas, cobertura, desglose y navegación accesible", async ({
  page,
}) => {
  await mockCycleReviewHttp(page);
  await open(page);
  await page
    .getByRole("button", { name: "Ir a comparación", exact: true })
    .click();
  await expect(
    comparison(page).getByRole("heading", { level: 2 }),
  ).toBeFocused();
  const table = comparison(page).getByRole("table", {
    name: "Comparación conjunta · IA y paciente",
    exact: true,
  });
  await expect(table).toBeVisible();
  await expect(
    table.getByRole("row").filter({ hasText: "Calorías promedio" }),
  ).toContainText("1.050 kcal");
  await expect(
    table.getByRole("row").filter({ hasText: "Calorías promedio" }),
  ).toContainText("+300 kcal");
  await comparison(page)
    .getByText("Ver comparación separada por origen", { exact: true })
    .click();
  await expect(
    comparison(page).getByRole("table", {
      name: "Solo registros estimados por IA",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ir a registros y ejemplos", exact: true })
    .click();
  await expect(records(page).getByRole("heading", { level: 2 })).toBeFocused();
});

test("3.16 · primer ciclo no inventa comparación", async ({ page }) => {
  const http = await mockCycleReviewHttp(page, { firstCycle: true });
  await open(page);
  await expect(comparison(page)).toContainText(
    "No hay un ciclo anterior publicado con el que comparar.",
  );
  expect(
    http.reviewState.reads.every((path) => !path.includes("previous-cycle")),
  ).toBeTruthy();
});

test("3.16 · fallo del anterior conserva resumen actual y permite reintentar", async ({
  page,
}) => {
  const http = await mockCycleReviewHttp(page);
  http.reviewState.failPrevious = true;
  await open(page);
  await expect(comparison(page).getByRole("alert")).toContainText(
    "El período actual sigue disponible.",
  );
  await expect(summary(page)).toContainText("1.350 kcal");
  http.reviewState.failPrevious = false;
  await page
    .getByRole("button", { name: "Reintentar comparación", exact: true })
    .click();
  await expect(
    comparison(page).getByRole("table", {
      name: "Comparación conjunta · IA y paciente",
      exact: true,
    }),
  ).toBeVisible();
});

test("3.16 · carga, error y contrato inválido no presentan cero como cifra real", async ({
  page,
}) => {
  const http = await mockCycleReviewHttp(page);
  http.reviewState.delayed = true;
  await page.goto(`/nutrition/${intakePatient}?tab=cierre`);
  await expect(
    page.getByRole("status", {
      name: "Cargando revisión del período",
      exact: true,
    }),
  ).toBeVisible();
  http.reviewState.failCurrent = true;
  http.reviewState.release();
  await expect(
    page.getByRole("alert", {
      name: "No pudimos cargar el período",
      exact: true,
    }),
  ).toBeVisible();
  await expect(summary(page)).toHaveCount(0);
  http.reviewState.failCurrent = false;
  http.reviewState.malformed = true;
  await page
    .getByRole("button", { name: "Reintentar período", exact: true })
    .click();
  await expect(
    page.getByRole("alert", {
      name: "No pudimos cargar el período",
      exact: true,
    }),
  ).toBeVisible();
  http.reviewState.malformed = false;
  await page
    .getByRole("button", { name: "Reintentar período", exact: true })
    .click();
  await expect(summary(page)).toContainText("1.350 kcal");
});

test("3.16 · sin comidas, agua sola y menú desconocido conservan la semántica de ausencia", async ({
  page,
}) => {
  await mockCycleReviewHttp(page, { waterOnly: true });
  await open(page);
  await expect(summary(page)).toContainText("0 de 32");
  const stats = summary(page).locator(".nutrition-review-stats");
  await expect(stats).toContainText("Sin dato");
  await expect(stats).toContainText("500 ml");
  await expect(summary(page)).toContainText(
    "La adherencia no se sustituye por cero.",
  );
});

test("3.16 · período vacío y galería vacía explícitos", async ({ page }) => {
  await mockCycleReviewHttp(page, { empty: true });
  await open(page);
  await expect(summary(page)).toContainText("0 de 32");
  await expect(records(page)).toContainText(
    "No hay comidas ni registros para mostrar en este período.",
  );
  await expect(gallery(page)).toHaveCount(0);
});

test("3.16 · menú desconocido no fabrica adherencia ni meta histórica", async ({
  page,
}) => {
  await mockCycleReviewHttp(page, { unknownMenu: true });
  await open(page);
  await expect(summary(page)).toContainText("1 día con menú desconocido.");
  await expect(
    summary(page).locator(".nutrition-review-stats > div").nth(1),
  ).toContainText("Sin dato");
  await expect(summary(page)).toContainText("1.350 kcal");
});

test("3.16 · continuidad de 130 días usa todas las fechas en ventanas de hasta 100", async ({
  page,
}) => {
  const http = await mockCycleReviewHttp(page, { longContinuity: true });
  await open(page);
  await expect(summary(page)).toContainText("3 de 130");
  await expect(summary(page)).toContainText("1.350 kcal");
  const current = http.intakeState.requests.filter((r) => r.from >= http.start);
  expect(new Set(current.map((r) => `${r.from}/${r.to}`)).size).toBe(2);
  for (const r of current)
    expect(
      (Date.parse(r.to) - Date.parse(r.from)) / 86400000 + 1,
    ).toBeLessThanOrEqual(100);
  await expect(records(page)).toContainText("Mostrando 6 de 7 registros");
});

test("3.16 · galería, filtro, detalle, anclado y revisión diaria reales", async ({
  page,
}) => {
  const http = await mockCycleReviewHttp(page);
  await open(page);
  await expect(gallery(page).locator(":scope > li")).toHaveCount(6);
  await records(page)
    .getByRole("button", { name: "Cargar más registros", exact: true })
    .click();
  await expect(gallery(page).locator(":scope > li")).toHaveCount(7);
  await records(page)
    .getByRole("button", { name: "Con foto", exact: true })
    .click();
  await expect(gallery(page).locator(":scope > li")).toHaveCount(4);
  await records(page)
    .getByRole("button", { name: "Todos", exact: true })
    .click();
  await gallery(page)
    .getByRole("button", { name: "Ver registro y ejemplo", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Registro y ejemplo anclado",
    exact: true,
  });
  await expect(dialog).toContainText("Menú histórico");
  await dialog
    .getByRole("textbox", { name: "Nota interna del ejemplo (opcional)" })
    .fill("Ejemplo para conversar");
  await dialog
    .getByRole("button", { name: "Anclar como ejemplo", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Quitar ejemplo anclado", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Marcar día como revisado", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Deshacer revisión", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await records(page)
    .getByRole("button", { name: "Anclados", exact: true })
    .click();
  await expect(gallery(page).locator(":scope > li")).toHaveCount(1);
  await expect(gallery(page)).toContainText("Ejemplo para conversar");
  expect(http.state.writes.map((w) => w.path)).toEqual([
    `/api/v1/nutrition/cycles/${reviewCycleId}/highlights/${intakeToday}-des`,
    `/api/v1/nutrition/cycles/${reviewCycleId}/days/${intakeToday}/review`,
  ]);
  await page.reload();
  await expect(records(page)).toContainText("1 ejemplo anclado");
  await records(page)
    .getByRole("button", { name: "Anclados", exact: true })
    .click();
  await expect(gallery(page)).toContainText("Ejemplo para conversar");
});

test("3.16 · fallo de ejemplos visible con reintento y registros conservados", async ({
  page,
}) => {
  const http = await mockCycleReviewHttp(page);
  http.state.failRead = true;
  await open(page);
  await expect(
    records(page).getByRole("alert", {
      name: "No se pudieron cargar los ejemplos anclados",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    records(page).getByRole("button", { name: "Anclados", exact: true }),
  ).toBeDisabled();
  await expect(gallery(page)).toBeVisible();
  http.state.failRead = false;
  await records(page)
    .getByRole("button", { name: "Actualizar ejemplos", exact: true })
    .click();
  await expect(
    records(page).getByRole("button", { name: "Anclados", exact: true }),
  ).toBeEnabled();
});

test("3.16 · permisos de gestión y fotografías respetados", async ({
  page,
}) => {
  const http = await mockCycleReviewHttp(page, { readonly: true });
  await page.goto(`/nutrition/${intakePatient}?tab=cierre`);
  await expect(
    page.getByText("No tienes permiso para preparar el cierre de este ciclo.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(http.reviewState.reads).toEqual([]);
});

test("3.16 · sin permiso de fotos no se descargan ni se filtran fotografías", async ({
  page,
}) => {
  const http = await mockCycleReviewHttp(page, { noPhotos: true });
  await open(page);
  await expect(
    records(page).getByRole("button", { name: "Con foto", exact: true }),
  ).toBeDisabled();
  await expect(gallery(page).getByRole("img")).toHaveCount(0);
  expect(http.intakeState.photoRequests).toBe(0);
});
