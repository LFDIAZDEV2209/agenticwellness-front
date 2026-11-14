import { expect, test, type Page } from "@playwright/test";
import { mockBienestarPhase1 } from "./fixtures/bienestar-fase1-http";

const name =
  "Programa COPP-ADRESD de acompañamiento integral para hábitos saludables y bienestar durante 83 días";
async function fixture(page: Page, english = false) {
  const phase = await mockBienestarPhase1(page);
  phase.template.name = name;
  const state = {
    detailFails: false,
    saves: [] as { totalDays: number; totalWeeks: number }[],
  };
  if (english)
    await page.route("**/api/auth/me/preferences", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ lang: "en", accentColor: null }),
      }),
    );
  await page.route(
    `**/api/v1/program/templates/${phase.template.id}`,
    (route) => {
      if (route.request().method() === "GET" && state.detailFails)
        return route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({ detail: "Error sintético de carga" }),
        });
      if (route.request().method() === "PUT") {
        state.saves.push(route.request().postDataJSON());
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(phase.template),
        });
      }
      return route.fallback();
    },
  );
  return { ...phase, ux: state };
}

test("1.27 H2b · error de edición visible y reintento recuperable sin escrituras", async ({
  page,
}) => {
  const http = await fixture(page);
  http.ux.detailFails = true;
  await page.goto("/program/gestion?view=plantillas");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "No se pudo abrir la plantilla" });
  await expect(alert).toBeVisible();
  await expect(alert).toBeInViewport();
  await expect(alert).toContainText(name);
  await expect(
    page.getByRole("dialog", { name: "Editar plantilla", exact: true }),
  ).toHaveCount(0);
  expect(http.ux.saves).toHaveLength(0);
  http.ux.detailFails = false;
  await alert.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Editar plantilla", exact: true }),
  ).toBeVisible();
  await expect(alert).toHaveCount(0);
  expect(http.ux.saves).toHaveLength(0);
  expect(http.unknowns).toEqual([]);
});

test("1.27 H2b · error y duración traducidos al inglés", async ({ page }) => {
  const http = await fixture(page, true);
  http.ux.detailFails = true;
  await page.goto("/program/gestion?view=plantillas");
  await expect(page.getByRole("table")).toContainText("83 days · 12 weeks");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Unable to open the template" });
  await expect(alert).toBeVisible();
  await expect(
    alert.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  expect(http.ux.saves).toHaveLength(0);
});

test("1.27 H3 · lista y edición conservan 83 días y guardan 12 semanas", async ({
  page,
}) => {
  const http = await fixture(page);
  await page.goto("/program/gestion?view=plantillas");
  await expect(page.getByRole("table")).toContainText("83 días · 12 semanas");
  await expect(page.getByRole("table")).not.toContainText("84 días");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Editar plantilla",
    exact: true,
  });
  await expect(
    dialog.getByLabel("Total de días *", { exact: true }),
  ).toHaveValue("83");
  await expect(dialog).toContainText("83 días · 12 semanas");
  await expect(dialog).not.toContainText("84");
  await dialog.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(http.ux.saves).toHaveLength(1);
  expect(http.ux.saves[0]).toMatchObject({ totalDays: 83, totalWeeks: 12 });
});

test("1.27 H4 · nombre largo en dos líneas y título completo en escritorio", async ({
  page,
}, testInfo) => {
  await fixture(page);
  await page.goto("/program/gestion?view=plantillas");
  const title = page.getByRole("table").getByText(name, { exact: true });
  await expect(title).toBeVisible();
  await expect(title).toHaveAttribute("title", name);
  expect(
    await title.evaluate(
      (node) =>
        node.getBoundingClientRect().height >
        parseFloat(getComputedStyle(node).lineHeight),
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("templates-desktop.png"),
    fullPage: true,
  });
});

test("1.27 H5 · móvil muestra tarjetas con estado y todas las acciones sin desplazamiento horizontal", async ({
  page,
}, testInfo) => {
  const http = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/program/templates?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          http.template,
          {
            ...http.template,
            id: "active-qa",
            name: "Plantilla activa QA",
            status: "Active",
          },
          {
            ...http.template,
            id: "archived-qa",
            name: "Plantilla archivada QA",
            status: "Archived",
          },
        ],
        total: 3,
        page: 1,
        pageSize: 5,
        totalPages: 1,
      }),
    }),
  );
  await page.goto("/program/gestion?view=plantillas");
  await expect(page.getByRole("table")).toHaveCount(0);
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(3);
  const draft = cards.filter({
    has: page.getByRole("heading", { name, exact: true }),
  });
  await expect(draft).toContainText("Borrador");
  await expect(draft).toContainText("83 días · 12 semanas");
  await expect(
    draft.getByRole("button", { name: "Editar", exact: true }),
  ).toBeVisible();
  await expect(
    draft.getByRole("button", { name: "Ver detalles", exact: true }),
  ).toBeVisible();
  await expect(
    draft.getByRole("button", { name: "Publicar", exact: true }),
  ).toBeVisible();
  const active = cards.filter({
    has: page.getByRole("heading", {
      name: "Plantilla activa QA",
      exact: true,
    }),
  });
  await expect(active).toContainText("Activo");
  await active.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Plantilla activa QA",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await draft.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Editar plantilla",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  await draft.getByRole("button", { name: "Publicar", exact: true }).click();
  const publish = page.getByRole("dialog", {
    name: "Publicar la versión 2",
    exact: true,
  });
  await expect(publish.locator("dd")).toHaveText(["23", "7"]);
  await publish.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("templates-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(http.state.publications).toHaveLength(0);
  expect(http.ux.saves).toHaveLength(0);
  expect(http.unknowns).toEqual([]);
});
