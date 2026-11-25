import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  mockPatientsHttp,
  patientWorkspaceUserId,
} from "./fixtures/patients-http";
import type { MediaItem } from "../features/media/types";
import type { PatientPodcastAssignment } from "../features/patients/services/patient-podcast-assignment-service";

const podcast: MediaItem = {
  id: "00000000-0000-4000-8000-000000000501",
  title: "Respirar y descansar",
  author: "Equipo QA",
  description: null,
  category: "Nutricion",
  mediaType: "Podcast",
  status: "Published",
  storageKey: "media/qa-rest.mp3",
  thumbnailKey: null,
  contentType: "audio/mpeg",
  fileSizeBytes: 12000,
  durationSecs: 60,
  sortOrder: 1,
  day: 0,
  month: 0,
  publishedAt: "2026-11-14",
  createdAt: "2026-11-14",
  createdBy: null,
  updatedAt: null,
};

/** Contrato a21c71d: el POST aplica; no existe endpoint de simulación. Todo el HTTP es sintético. */
async function fixture(
  page: Page,
  options: {
    role?: string;
    noEdit?: boolean;
    english?: boolean;
    many?: boolean;
  } = {},
) {
  const permissions = [
    "Patients.View",
    "Media.View",
    ...(options.noEdit ? [] : ["Program.Edit"]),
  ];
  const base = await mockPatientsHttp(page, {
    permissions,
    english: options.english,
  });
  if (options.many) {
    const sample = base.rows[0];
    base.rows.splice(
      0,
      base.rows.length,
      ...Array.from({ length: 101 }, (_, index) => ({
        ...sample,
        patientId: `00000000-0000-4000-8000-${String(index + 1000).padStart(12, "0")}`,
        firstName: `Paciente ${index + 1}`,
        lastName: "QA",
      })),
    );
  }
  const state = {
    calls: [] as PatientPodcastAssignment[],
    hold: false,
    error: "",
    invalidMedia: false,
  };
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: patientWorkspaceUserId,
        email: "qa@example.invalid",
        firstName: "Ana",
        lastName: "Pruebas",
        roles: [options.role ?? "Admin"],
        permissions,
      }),
    }),
  );
  await page.route("**/api/v1/storage/sign**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ url: "/qa-patient-podcast" }),
    }),
  );
  await page.route("**/qa-patient-podcast", (route) =>
    route.fulfill({ contentType: "audio/mpeg", body: "" }),
  );
  await page.route("**/api/v1/media**", (route) => {
    const item = state.invalidMedia
      ? { ...podcast, storageKey: "media/podcasts/demo-copp.mp3" }
      : podcast;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        new URL(route.request().url()).pathname.endsWith(podcast.id)
          ? item
          : {
              items: [
                item,
                { ...item, id: "draft", status: "Draft", title: "Borrador" },
                { ...item, id: "video", mediaType: "Video", title: "Vídeo" },
              ],
              totalCount: 1,
              page: 1,
              pageSize: 12,
              totalPages: 1,
            },
      ),
    });
  });
  await page.route(
    "**/api/v1/program/content/bulk-assign-patients",
    async (route) => {
      expect(route.request().method()).toBe("POST");
      const input = route.request().postDataJSON() as PatientPodcastAssignment;
      state.calls.push(input);
      while (state.hold)
        await new Promise((resolve) => setTimeout(resolve, 20));
      await route.fulfill({
        status: state.error ? (state.error === "forbidden" ? 403 : 422) : 200,
        contentType: "application/json",
        body: JSON.stringify(
          state.error
            ? { detail: state.error }
            : {
                aplicadas: input.patientIds.length - 1,
                omitidasSemanaIniciada: 1,
                omitidasSinAlcance: [input.patientIds.at(-1)],
              },
        ),
      });
    },
  );
  return { ...base, state };
}

async function selectFirst(page: Page) {
  await expect(page.getByRole("table")).toBeVisible();
  await page
    .getByRole("checkbox", { name: /^Seleccionar a / })
    .first()
    .check();
}

async function choosePodcast(page: Page, english = false) {
  await page
    .getByRole("button", {
      name: english ? "Choose podcast" : "Elegir podcast",
      exact: true,
    })
    .click();
  const picker = page.getByRole("dialog", {
    name: english ? "Choose podcast" : "Elegir podcast",
    exact: true,
  });
  await expect(
    picker.getByRole("button", {
      name: english
        ? "Select Respirar y descansar"
        : "Seleccionar Respirar y descansar",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", {
      name: /Seleccionar Borrador|Seleccionar Vídeo/,
    }),
  ).toHaveCount(0);
  await picker
    .getByRole("button", {
      name: english
        ? "Select Respirar y descansar"
        : "Seleccionar Respirar y descansar",
      exact: true,
    })
    .click();
  await picker
    .getByRole("button", { name: english ? "Add 1" : "Añadir 1", exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  await page
    .getByLabel(english ? "From week" : "Desde la semana", { exact: true })
    .selectOption("1");
  await page
    .getByLabel(english ? "To week" : "Hasta la semana", { exact: true })
    .selectOption("12");
}

async function openReview(page: Page) {
  await selectFirst(page);
  await page
    .getByRole("button", { name: "Asignar podcast", exact: true })
    .click();
  await choosePodcast(page);
  await page
    .getByRole("button", { name: "Revisar asignación", exact: true })
    .click();
}

async function capture(page: Page, name: string) {
  const directory = process.env.ERP_STYLE_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: `${directory}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test("1.24 · selección entre páginas y filtros, revisión sin escritura y resultado del contrato", async ({
  page,
}) => {
  const http = await fixture(page, { role: "ClinicalDirector" });
  await page.goto("/patients?tab=estado-clinico");
  await selectFirst(page);
  await expect(
    page.getByRole("checkbox", {
      name: "Seleccionar personas de esta página",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "mixed");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByText("Página 2 de 2", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", { name: /^Seleccionar a / })
    .first()
    .check();
  await page
    .getByLabel("Buscar personas", { exact: true })
    .fill("sin coincidencia");
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Acciones de personas seleccionadas" }),
  ).toContainText("2 personas seleccionadas");
  await page
    .getByRole("button", { name: "Asignar podcast", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revisar asignación", exact: true }),
  ).toBeDisabled();
  await choosePodcast(page);
  await page.getByLabel("Desde la semana", { exact: true }).selectOption("3");
  await page.getByLabel("Hasta la semana", { exact: true }).selectOption("2");
  await expect(
    page.getByRole("button", { name: "Revisar asignación", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Hasta la semana", { exact: true }).selectOption("12");
  await page
    .getByRole("button", { name: "Revisar asignación", exact: true })
    .click();
  await capture(page, "1.24-review-desktop");
  expect(http.state.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(http.state.calls).toHaveLength(0);
  await expect(
    page.getByRole("region", { name: "Acciones de personas seleccionadas" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Asignar podcast", exact: true })
    .click();
  await choosePodcast(page);
  await page
    .getByRole("button", { name: "Revisar asignación", exact: true })
    .click();
  http.state.hold = true;
  try {
    await page
      .getByRole("button", { name: "Confirmar y asignar", exact: true })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      });
    await expect.poll(() => http.state.calls.length).toBe(1);
    await expect(
      page.getByRole("button", { name: "Aplicando...", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Revisar asignación", exact: true }),
    ).toBeVisible();
  } finally {
    http.state.hold = false;
  }
  const result = page.getByRole("dialog", {
    name: "Resultado de la asignación",
    exact: true,
  });
  await expect(result).toBeVisible();
  expect(http.state.calls).toEqual([
    {
      patientIds: [http.rows[0].patientId, http.rows[10].patientId],
      mediaId: podcast.id,
      semanaDesde: 1,
      semanaHasta: 12,
    },
  ]);
  await expect(result.locator("dd")).toHaveText(["1", "1", "1"]);
  await expect(
    result.getByText(
      "Los conteos de aplicados y semanas iniciadas pueden incluir al mismo paciente.",
    ),
  ).toBeVisible();
  await expect(
    result.getByText(http.rows[10].patientId, { exact: true }),
  ).toBeVisible();
  await expect(result).not.toContainText(http.rows[10].firstName);
  await capture(page, "1.24-result-desktop");
  await page.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Acciones de personas seleccionadas" }),
  ).toHaveCount(0);
  expect(http.unknowns).toEqual([]);
});

for (const error of [
  "ACTIVE_ENROLLMENT_REQUIRED",
  "PROGRAM_WEEK_OUT_OF_RANGE",
  "PODCAST_NOT_PUBLISHED",
  "forbidden",
]) {
  test(`1.24 · ${error} conserva la selección y permite corregir`, async ({
    page,
  }) => {
    const http = await fixture(page);
    http.state.error = error;
    await page.goto("/patients?tab=estado-clinico");
    await openReview(page);
    await page
      .getByRole("button", { name: "Confirmar y asignar", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog).not.toContainText(error);
    if (error === "PODCAST_NOT_PUBLISHED") {
      await expect(
        dialog.getByRole("button", { name: "Revisar asignación", exact: true }),
      ).toBeDisabled();
    } else
      await expect(
        dialog.getByRole("button", {
          name: "Confirmar y asignar",
          exact: true,
        }),
      ).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Acciones de personas seleccionadas" }),
    ).toContainText("1 persona seleccionada");
    expect(http.state.calls).toHaveLength(1);
  });
}

test("1.24 · exige rol y permiso, sin afectar el directorio de solo lectura", async ({
  page,
}) => {
  for (const options of [
    { role: "CareCoordinator" },
    { role: "Admin", noEdit: true },
  ]) {
    await fixture(page, options);
    await page.goto("/patients?tab=estado-clinico");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Asignar podcast", exact: true }),
    ).toHaveCount(0);
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("1.24 · máximo 100, selección de página y limpieza", async ({ page }) => {
  await fixture(page, { many: true });
  await page.goto("/patients?tab=estado-clinico");
  const all = page.getByRole("checkbox", {
    name: "Seleccionar personas de esta página",
    exact: true,
  });
  for (let index = 1; index <= 10; index++) {
    await expect(
      page.getByText(`Página ${index} de 11`, { exact: true }),
    ).toBeVisible();
    await all.check();
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  }
  await expect(
    page.getByText("Página 11 de 11", { exact: true }),
  ).toBeVisible();
  await expect(all).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /^Seleccionar a / }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Acciones de personas seleccionadas" }),
  ).toContainText("100 pacientes seleccionados");
  await page
    .getByRole("button", { name: "Limpiar selección", exact: true })
    .click();
  await expect(all).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Acciones de personas seleccionadas" }),
  ).toHaveCount(0);
});

test("1.24 · móvil en inglés, selector reutilizado y ningún desbordamiento del diálogo", async ({
  page,
}) => {
  const http = await fixture(page, { english: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/patients?tab=estado-clinico");
  await expect(page.getByRole("table")).toBeVisible();
  await page
    .getByRole("checkbox", { name: /^Select / })
    .nth(1)
    .check();
  await page
    .getByRole("button", { name: "Assign podcast", exact: true })
    .click();
  await choosePodcast(page, true);
  await page
    .getByRole("button", { name: "Review assignment", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review assignment",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "1 patient selected", exact: true }),
  ).toBeInViewport();
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await capture(page, "1.24-review-mobile-en");
  expect(http.state.calls).toHaveLength(0);
});

test("1.24 · un placeholder no permite revisar ni enviar", async ({ page }) => {
  const http = await fixture(page);
  http.state.invalidMedia = true;
  await page.goto("/patients?tab=estado-clinico");
  await selectFirst(page);
  await page
    .getByRole("button", { name: "Asignar podcast", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Elegir podcast", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Elegir podcast",
    exact: true,
  });
  await expect(
    picker.getByRole("button", {
      name: "Seleccionar Respirar y descansar",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(picker).toContainText("Sin archivo · no se puede elegir");
  await picker.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Revisar asignación", exact: true }),
  ).toBeDisabled();
  expect(http.state.calls).toHaveLength(0);
});
