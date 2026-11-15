import { test, expect } from "@playwright/test";
import {
  intakePatient,
  intakeToday,
  mockIntakeHttp,
} from "./fixtures/nutrition-intake-http";

// El navegador está en el día siguiente; el calendario debe usar America/Bogota.
test.use({ timezoneId: "Asia/Tokyo" });

const open = async (page: import("@playwright/test").Page) => {
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  await expect(
    page.getByRole("tab", { name: "Registros de comidas", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
};
const strip = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "30 días del ciclo", exact: true });
const choose = (page: import("@playwright/test").Page, day: number) =>
  page.getByRole("button", { name: new RegExp(`^Día ${day} ·`) }).click();

test("3.14 · 30 días, continuidad, menú histórico, orígenes y foto ampliable sin escrituras", async ({
  page,
}) => {
  const http = await mockIntakeHttp(page);
  await open(page);
  await expect(strip(page).getByRole("button")).toHaveCount(30);
  await expect(
    page.getByRole("list", { name: "Días en continuidad" }).getByRole("button"),
  ).toHaveCount(3);
  await expect(
    strip(page).getByRole("button", { name: /^Día 1 ·/ }),
  ).toHaveAttribute("data-state", "complete");
  await expect(
    strip(page).getByRole("button", { name: /^Día 2 ·/ }),
  ).toHaveAttribute("data-state", "partial");
  await expect(
    strip(page).getByRole("button", { name: /^Día 3 ·/ }),
  ).toHaveAttribute("data-state", "interruption");
  await choose(page, 1);
  await expect(
    page.getByRole("region", { name: "Detalle del día", exact: true }),
  ).toContainText("versión 1");
  await expect(
    page.getByRole("region", { name: "Detalle del día", exact: true }),
  ).toContainText("Menú histórico de lentejas");
  await page
    .getByRole("button", { name: "Ampliar foto de la comida", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("img")).toHaveAttribute(
    "src",
    /signature=synthetic/,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Ampliar foto de la comida",
      exact: true,
    }),
  ).toBeFocused();
  await choose(page, 33);
  await page.locator(".nutrition-intake-meals").getByRole("button", { name: /^Almuerzo/ }).click();
  const day = page.getByRole("region", {
    name: "Detalle del día",
    exact: true,
  });
  await expect(day).toContainText("versión 2");
  await expect(day).toContainText("Confirmado por el paciente");
  await expect(day).toContainText("Estimación original por IA");
  await expect(day).toContainText("890 kcal");
  await expect(day).toContainText("800 kcal");
  await expect(day).toContainText("Porción estimada: 120 g");
  await day.getByRole("button", { name: /^Desayuno/ }).click();
  await expect(
    page.getByRole("complementary", { name: "Detalle de la comida" }),
  ).toContainText("Confirmado por el paciente");
  await expect(
    page.getByRole("complementary", { name: "Detalle de la comida" }),
  ).toContainText("Sin dato");
  expect(http.state.requests.every((row) => row.method === "GET")).toBe(true);
  expect(http.state.requests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ from: http.start, to: http.end }),
      expect.objectContaining({ to: intakeToday }),
    ]),
  );
  expect(http.writes).toEqual([]);
});

test("3.14 · carga, error visible y reintento; contrato incompleto no produce días vacíos", async ({
  page,
}) => {
  const http = await mockIntakeHttp(page, { status: 503, delay: true });
  await open(page);
  await expect(
    page.getByRole("status", {
      name: "Cargando registros de comidas",
      exact: true,
    }),
  ).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
  http.state.delayed = false;
  http.state.release();
  await expect(
    page.getByRole("alert", {
      name: "No pudimos cargar los registros de comidas",
      exact: true,
    }),
  ).toContainText("No pudimos cargar los registros de comidas");
  await expect(strip(page)).toHaveCount(0);
  http.state.status = 200;
  http.state.malformed = true;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("alert", {
      name: "No pudimos cargar los registros de comidas",
      exact: true,
    }),
  ).toContainText("No se pudieron consultar los registros");
  await expect(strip(page)).toHaveCount(0);
  http.state.malformed = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(strip(page).getByRole("button")).toHaveCount(30);
});

test("3.14 · días vacíos, hoy sin datos y futuros sin interrupciones", async ({
  page,
}) => {
  await mockIntakeHttp(page, { empty: true, future: true });
  await open(page);
  await expect(strip(page).getByRole("button")).toHaveCount(30);
  await expect(
    strip(page).getByRole("button", { name: /^Día 4 ·/ }),
  ).toHaveAttribute("data-state", "no_data");
  await expect(
    strip(page).getByRole("button", { name: /^Día 5 ·/ }),
  ).toHaveAttribute("data-state", "future");
  await choose(page, 3);
  await expect(
    page.getByText("No hay comidas registradas en este día.", { exact: true }),
  ).toBeVisible();
  await choose(page, 5);
  await expect(
    page.getByText(
      "Este día aún no comienza; no se cuenta como interrupción.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("3.14 · coordinación no solicita fotos aunque el DTO defectuoso incluya URL", async ({
  page,
}) => {
  const http = await mockIntakeHttp(page, { noPhotos: true });
  await open(page);
  await expect(
    page.getByText("Fotos restringidas por permisos", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Ampliar foto de la comida",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(http.state.photoRequests).toBe(0);
});

test("3.14 · sin permiso de registros no se consulta intake", async ({
  page,
}) => {
  const http = await mockIntakeHttp(page, { noRecordsPermission: true });
  await open(page);
  await expect(
    page.getByText(
      "No tienes permiso para consultar los registros de comidas.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(http.state.requests).toHaveLength(0);
});

test("3.14 · una foto que caduca abierta se retira y permite solicitar otra URL", async ({
  page,
}) => {
  await mockIntakeHttp(page);
  await open(page);
  await choose(page, 1);
  await page
    .getByRole("button", { name: "Ampliar foto de la comida", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.clock.fastForward(301_000);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("img", {
      name: "Foto de la comida registrada",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Actualizar foto", exact: true }),
  ).toBeVisible();
});

test("3.14 · 404 de alcance muestra aviso con reintento y oculta la tira", async ({
  page,
}) => {
  await mockIntakeHttp(page, { status: 404 });
  await open(page);
  await expect(
    page.getByRole("alert", {
      name: "No pudimos cargar los registros de comidas",
      exact: true,
    }),
  ).toContainText("El paciente no está disponible en tu alcance");
  await expect(strip(page)).toHaveCount(0);
  await expect(
    page.getByRole("img", {
      name: "Foto de la comida registrada",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("3.14 · foto caducada se renueva consultando intake, sin ruta de firma genérica", async ({
  page,
}) => {
  const http = await mockIntakeHttp(page, { expiredPhoto: true });
  await open(page);
  await choose(page, 1);
  await expect(
    page.getByText("La foto caducó o no está disponible.", { exact: true }),
  ).toBeVisible();
  const before = http.state.requests.length;
  await page
    .getByRole("button", { name: "Actualizar foto", exact: true })
    .click();
  await expect.poll(() => http.state.requests.length).toBeGreaterThan(before);
  expect(http.state.photoRequests).toBe(0);
});

test("3.14 · continuidad larga en ventanas, sin huecos ni fechas repetidas", async ({
  page,
}) => {
  const http = await mockIntakeHttp(page, { longContinuity: true });
  await open(page);
  const continuity = page.getByRole("list", {
    name: "Días en continuidad",
    exact: true,
  });
  await expect(continuity.getByRole("button")).toHaveCount(30);
  await expect(continuity.getByRole("button").first()).toHaveAccessibleName(
    /^Día 66 ·/,
  );
  await page
    .getByRole("button", { name: "Continuidad anterior", exact: true })
    .click();
  await expect(continuity.getByRole("button").first()).toHaveAccessibleName(
    /^Día 36 ·/,
  );
  await page
    .getByRole("button", { name: "Continuidad anterior", exact: true })
    .click();
  await expect(continuity.getByRole("button")).toHaveCount(5);
  await expect(continuity.getByRole("button").first()).toHaveAccessibleName(
    /^Día 31 ·/,
  );
  await expect(
    page.getByRole("button", { name: "Continuidad anterior", exact: true }),
  ).toBeDisabled();
  expect(
    http.state.requests.every(
      (row) => (Date.parse(row.to) - Date.parse(row.from)) / 86_400_000 <= 29,
    ),
  ).toBe(true);
});

test("3.14 · no atribuye a continuidad los días del siguiente ciclo publicado", async ({
  page,
}) => {
  await mockIntakeHttp(page, { nextCycle: true });
  await open(page);
  await expect(
    page
      .getByRole("list", { name: "Días en continuidad", exact: true })
      .getByRole("button"),
  ).toHaveCount(1);
});

test("3.14 · móvil 320px sin desborde y cambio de día por teclado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mockIntakeHttp(page);
  await open(page);
  const first = strip(page).getByRole("button").first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "Detalle del día", exact: true }),
  ).toContainText("Menú histórico de lentejas");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("3.14 · inglés conserva orígenes, estados y mensajes traducidos", async ({
  page,
}) => {
  await mockIntakeHttp(page, { english: true });
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  await page.getByRole("button", { name: /^Day 1 ·/ }).click();
  await expect(
    page.getByRole("heading", { name: "Meal records", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "30 cycle days", exact: true })
      .getByRole("button"),
  ).toHaveCount(30);
  await expect(
    page.getByRole("region", { name: "Day details", exact: true }),
  ).toContainText("Estimated by AI");
});
