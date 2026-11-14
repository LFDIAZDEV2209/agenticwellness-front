import { test, expect, type Page } from "@playwright/test";
import { mockPatientsHttp } from "./fixtures/patients-http";
import type { ProgramTemplate } from "../features/program/types";

/** HTTP sintético del contrato 1.11 y el ProblemDetails 1.10a; nunca publica datos reales. */
async function fixture(
  page: Page,
  options: {
    english?: boolean;
    editable?: boolean;
    gaps?: boolean;
    previewError?: boolean;
    publishError?: boolean;
    zero?: boolean;
    hold?: boolean;
  } = {},
) {
  await mockPatientsHttp(page, {
    english: options.english,
    permissions: [
      "Program.View",
      ...(options.editable === false ? [] : ["Program.Edit"]),
    ],
  });
  const template: ProgramTemplate = {
    id: "impact-template",
    code: "impact-83",
    name: "Programa QA 83 días",
    description: null,
    totalWeeks: 12,
    status: "Draft",
    version: 7,
    createdAt: "2026-11-14",
    createdBy: null,
    updatedBy: null,
    updatedAt: null,
    publishedAt: null,
    days: [],
  };
  const state = {
    previews: 0,
    publications: 0,
    holdPublication: false,
    previewError: options.previewError ?? false,
    publishError: options.publishError ?? false,
    gaps: options.gaps ?? false,
    hold: options.hold ?? false,
  };
  await page.route("**/api/v1/program/templates**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType:
          status === 422 ? "application/problem+json" : "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname.endsWith("/publish")) {
      expect(request.method()).toBe("POST");
      if (url.searchParams.get("preview") === "true") {
        state.previews++;
        // El test libera la respuesta después de comprobar el botón deshabilitado.
        while (state.hold)
          await new Promise((resolve) => setTimeout(resolve, 20));
        if (state.previewError)
          return reply({ detail: "Fallo de impacto" }, 503);
        return reply({
          pacientesQueCambian: options.zero ? 0 : 214,
          conPersonalizacionesFuturas: options.zero ? 0 : 37,
          semanasOmitidasIniciadas: options.zero ? 0 : 1052,
        });
      }
      state.publications++;
      while (state.holdPublication)
        await new Promise((resolve) => setTimeout(resolve, 20));
      if (state.gaps)
        return reply(
          {
            type: "about:blank",
            title: "Unprocessable Entity",
            status: 422,
            detail:
              "TEMPLATE_CONTENT_GAPS: completa el contenido de los días indicados antes de publicar.",
            gaps: [
              { day: 24, weekNumber: 4, weekday: 3, taskCode: "podcast" },
              { day: 24, weekNumber: 4, weekday: 3, taskCode: "ejercicio" },
              { day: 83, weekNumber: 12, weekday: 6, taskCode: "nut" },
            ],
          },
          422,
        );
      if (state.publishError) return reply({ detail: "No disponible" }, 503);
      template.status = "Active";
      template.version++;
      return reply(template);
    }
    if (url.pathname.endsWith("/impact-template")) return reply(template);
    return reply({
      data: [template],
      total: 1,
      page: 1,
      pageSize: 5,
      totalPages: 1,
    });
  });
  await page.goto("/program/gestion?view=plantillas");
  await expect(page.getByText(template.name, { exact: true })).toBeVisible();
  const open = async () => {
    await page
      .getByRole("button", {
        name: options.english ? "Publish" : "Publicar",
        exact: true,
      })
      .click();
    return page.getByRole("dialog", {
      name: options.english ? "Publish version 8" : "Publicar la versión 8",
      exact: true,
    });
  };
  return { state, template, open };
}

test("1.22 · impacto real del contrato, carga bloqueada, cancelar y confirmar una vez", async ({
  page,
}, testInfo) => {
  const http = await fixture(page, { hold: true });
  const dialog = await http.open();
  const publish = dialog.getByRole("button", {
    name: "Publicar versión 8",
    exact: true,
  });
  await expect(publish).toBeDisabled();
  expect(http.state.publications).toBe(0);
  http.state.hold = false;
  await expect(
    dialog.getByRole("region", { name: "A quién llega" }),
  ).toContainText("214");
  await expect(
    dialog.getByRole("region", { name: "A quién llega" }),
  ).toContainText("37");
  await expect(dialog).toContainText("1.052 semanas ya iniciadas no se tocan.");
  await expect(dialog).toContainText(
    "Los conteos pueden incluir a la misma persona.",
  );
  await page.screenshot({ path: testInfo.outputPath("impact-desktop.png") });
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(http.state.publications).toBe(0);
  const previewsBeforeReopen = http.state.previews;
  const reopened = await http.open();
  await expect(
    reopened.getByRole("button", { name: "Publicar versión 8", exact: true }),
  ).toBeEnabled();
  // Reabrir consulta datos nuevos; StrictMode puede duplicar los efectos en desarrollo.
  expect(http.state.previews).toBeGreaterThan(previewsBeforeReopen);
  await reopened
    .getByRole("button", { name: "Publicar versión 8", exact: true })
    .click();
  await expect(reopened).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Archivar", exact: true }),
  ).toBeVisible();
  expect(http.state.publications).toBe(1);
  expect(http.template.version).toBe(8);
});

test("1.22 · 422 lista todos los huecos del backend y bloquea sin publicar", async ({
  page,
}, testInfo) => {
  const http = await fixture(page, { gaps: true });
  const dialog = await http.open();
  const publish = dialog.getByRole("button", {
    name: "Publicar versión 8",
    exact: true,
  });
  await expect(publish).toBeEnabled();
  await publish.click();
  const alert = dialog.getByRole("alert");
  await expect(alert).toBeVisible();
  for (const summary of await alert.locator("summary").all()) await summary.click();
  await expect(alert).toContainText("Completa estos días antes de publicar.");
  await expect(alert.getByRole("listitem")).toHaveCount(3);
  await expect(alert).toContainText("Día 24 · Semana 4 · Miércoles · Podcast");
  await expect(alert).toContainText(
    "Día 24 · Semana 4 · Miércoles · Ejercicio",
  );
  await expect(alert).toContainText(
    "Día 83 · Semana 12 · Sábado · Plan nutricional",
  );
  await expect(publish).toBeDisabled();
  expect(http.template.status).toBe("Draft");
  expect(http.template.version).toBe(7);
  expect(http.state.publications).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("impact-gaps.png") });
  await dialog
    .getByRole("button", { name: "Revisar plantilla", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Plantilla de programa", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  http.state.gaps = false;
  const reopened = await http.open();
  await expect(
    reopened.getByRole("button", { name: "Publicar versión 8", exact: true }),
  ).toBeEnabled();
  await reopened
    .getByRole("button", { name: "Publicar versión 8", exact: true })
    .click();
  await expect(reopened).not.toBeVisible();
});

test("1.22 · impacto fallido no habilita publicar; recupera ceros sin datos inventados", async ({
  page,
}) => {
  const http = await fixture(page, { previewError: true, zero: true });
  const dialog = await http.open();
  await expect(dialog.getByRole("alert")).toContainText(
    "No se pudo cargar el impacto",
  );
  await expect(
    dialog.getByRole("button", { name: "Publicar versión 8", exact: true }),
  ).toBeDisabled();
  expect(http.state.publications).toBe(0);
  http.state.previewError = false;
  await dialog.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(dialog.locator("dd")).toHaveText(["0", "0"]);
  await expect(dialog).toContainText("0 semanas ya iniciadas no se tocan.");
  await expect(
    dialog.getByRole("button", { name: "Publicar versión 8", exact: true }),
  ).toBeEnabled();
});

test("1.22 · fallo al publicar conserva impacto y permite reintento explícito", async ({
  page,
}) => {
  const http = await fixture(page, { publishError: true });
  const dialog = await http.open();
  const publish = dialog.getByRole("button", {
    name: "Publicar versión 8",
    exact: true,
  });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(dialog.getByRole("alert")).toContainText("No se pudo publicar.");
  await expect(dialog.locator("dd")).toHaveText(["214", "37"]);
  http.state.publishError = false;
  await publish.click();
  await expect(dialog).not.toBeVisible();
  expect(http.state.publications).toBe(2);
});

test("1.22 · sin Program.Edit no ofrece publicación ni consulta impacto", async ({
  page,
}) => {
  const http = await fixture(page, { editable: false });
  await expect(
    page.getByRole("button", { name: "Publicar", exact: true }),
  ).toHaveCount(0);
  expect(http.state.previews).toBe(0);
  expect(http.state.publications).toBe(0);
});

test("1.22 · confirmación en curso bloquea doble envío y cierre accidental", async ({ page }) => {
  const http = await fixture(page);
  const dialog = await http.open();
  const publish = dialog.getByRole("button", { name: "Publicar versión 8", exact: true });
  await expect(publish).toBeEnabled();
  http.state.holdPublication = true;
  try {
    await publish.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(dialog.getByRole("button", { name: "Publicando...", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(http.state.publications).toBe(1);
  } finally {
    http.state.holdPublication = false;
  }
  await expect(dialog).not.toBeVisible();
  expect(http.template.version).toBe(8);
});

test("1.22 · inglés, 320px, teclado y foco al cerrar", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const http = await fixture(page, { english: true, gaps: true });
  const dialog = await http.open();
  await expect(dialog.locator("dd")).toHaveText(["214", "37"]);
  await expect(dialog).toContainText(
    "1,052 weeks that have already started remain unchanged.",
  );
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const publish = dialog.getByRole("button", {
    name: "Publish version 8",
    exact: true,
  });
  await publish.focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText(
    "Day 83 · Week 12 · Saturday · Nutrition plan",
  );
  await expect(publish).toBeDisabled();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("impact-mobile-en.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeFocused();
});
