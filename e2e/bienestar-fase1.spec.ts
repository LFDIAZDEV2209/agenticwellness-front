import { test as base, expect, type Page } from "@playwright/test";
import {
  mockBienestarPhase1,
  phase1Audio,
} from "./fixtures/bienestar-fase1-http";

const test = base.extend<{
  phase: Awaited<ReturnType<typeof mockBienestarPhase1>>;
}>({
  phase: async ({ page }, provide) => {
    const phase = await mockBienestarPhase1(page);
    await provide(phase);
    expect(
      phase.unknowns,
      "Ninguna API desconocida debe salir del arnés sintético",
    ).toEqual([]);
  },
});

async function choosePodcast(
  page: Page,
  title: string,
  label = "Elegir podcast",
) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const picker = page.getByRole("dialog", { name: label, exact: true });
  await picker
    .getByRole("button", { name: `Seleccionar ${title}`, exact: true })
    .click();
  await picker.getByRole("button", { name: "Añadir 1", exact: true }).click();
  await expect(picker).toHaveCount(0);
}

test("1.25 · publicar con huecos muestra la lista completa y mantiene el borrador", async ({
  page,
  phase,
}) => {
  phase.state.hasGaps = true;
  await page.goto("/program/gestion?view=plantillas");
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Publicar la versión 2",
    exact: true,
  });
  const publish = dialog.getByRole("button", {
    name: "Publicar versión 2",
    exact: true,
  });
  await expect(publish).toBeEnabled();
  await publish.click();
  const alert = dialog.getByRole("alert");
  await expect(alert.getByRole("listitem")).toHaveText([
    "Día 24 · Semana 4 · Miércoles · Podcast",
    "Día 24 · Semana 4 · Miércoles · Ejercicio",
    "Día 83 · Semana 12 · Sábado · Plan nutricional",
  ]);
  await expect(publish).toBeDisabled();
  expect(phase.state.publications).toHaveLength(1);
  expect(phase.template).toMatchObject({ status: "Draft", version: 1 });
  await dialog
    .getByRole("button", { name: "Revisar plantilla", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Plantilla de programa", exact: true }),
  ).toBeVisible();
});

test("1.25 · el impacto es visible antes de publicar; cancelar no publica y confirmar publica una vez", async ({
  page,
  phase,
}) => {
  await page.goto("/program/gestion?view=plantillas");
  const open = page.getByRole("button", { name: "Publicar", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "Publicar la versión 2",
    exact: true,
  });
  await expect(dialog.locator("dd")).toHaveText(["23", "7"]);
  await expect(dialog).toContainText("41 semanas ya iniciadas no se tocan.");
  expect(phase.state.previewRequests.length).toBeGreaterThan(0);
  expect(phase.state.publications).toHaveLength(0);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(phase.state.publications).toHaveLength(0);
  const previewsBeforeReopen = phase.state.previewRequests.length;
  await open.click();
  await expect(
    dialog.getByRole("button", { name: "Publicar versión 2", exact: true }),
  ).toBeEnabled();
  expect(phase.state.previewRequests.length).toBeGreaterThan(
    previewsBeforeReopen,
  );
  await dialog
    .getByRole("button", { name: "Publicar versión 2", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Archivar", exact: true }),
  ).toBeVisible();
  expect(phase.state.publications).toHaveLength(1);
  expect(phase.template).toMatchObject({ status: "Active", version: 2 });
});

test("1.25 · asignar desde pacientes conserva la selección y muestra los tres resultados", async ({
  page,
  phase,
}) => {
  await page.goto("/patients?tab=estado-clinico");
  const checkboxes = page.getByRole("checkbox", { name: /^Seleccionar a / });
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByText("Página 2 de 2", { exact: true })).toBeVisible();
  await checkboxes.nth(0).check();
  await page
    .getByRole("button", { name: "Asignar podcast", exact: true })
    .click();
  await choosePodcast(page, phase.podcast.title);
  await page.getByLabel("Desde la semana", { exact: true }).selectOption("2");
  await page.getByLabel("Hasta la semana", { exact: true }).selectOption("12");
  await page
    .getByRole("button", { name: "Revisar asignación", exact: true })
    .click();
  expect(phase.state.assignments).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirmar y asignar", exact: true })
    .click();
  const result = page.getByRole("dialog", {
    name: "Resultado de la asignación",
    exact: true,
  });
  await expect(result.locator("dd")).toHaveText(["2", "1", "1"]);
  await expect(result).toContainText(
    "Los conteos de aplicados y semanas iniciadas pueden incluir al mismo paciente.",
  );
  await expect(
    result.getByText(phase.rows[10].patientId, { exact: true }),
  ).toBeVisible();
  await expect(result).not.toContainText(phase.rows[10].firstName);
  expect(phase.state.assignments).toEqual([
    {
      patientIds: [
        phase.rows[0].patientId,
        phase.rows[1].patientId,
        phase.rows[10].patientId,
      ],
      mediaId: phase.podcast.id,
      semanaDesde: 2,
      semanaHasta: 12,
    },
  ]);
  await result.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Acciones de pacientes seleccionados" }),
  ).toHaveCount(0);
});

test("1.25 · retirar un medio en uso exige sustituto y muestra el impacto confirmado", async ({
  page,
  phase,
}) => {
  await page.goto(`/media/${phase.podcast.id}`);
  await page.getByRole("button", { name: "Despublicar", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: `Despublicar «${phase.podcast.title}»`,
    exact: true,
  });
  await expect(dialog.locator("dd")).toHaveText(["23", "2"]);
  await expect(
    dialog.getByRole("button", { name: "Despublicar", exact: true }),
  ).toBeDisabled();
  expect(phase.state.retirements).toHaveLength(0);
  await choosePodcast(page, phase.replacement.title, "Elegir sustituto");
  const confirm = dialog.getByRole("button", {
    name: "Despublicar y reemplazar",
    exact: true,
  });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.getByRole("dialog", { name: "Cambios guardados", exact: true }),
  ).toContainText("Impacto confirmado: 23 pacientes y 2 plantillas.");
  expect(phase.state.retirements).toEqual([
    { id: phase.podcast.id, replacementMediaId: phase.replacement.id },
  ]);
  expect(phase.podcast.status).toBe("Draft");
});

test("1.25 · la carga múltiple conserva los correctos y reintenta solo el archivo con error", async ({
  page,
  phase,
}) => {
  await page.goto("/media/new?mode=bulk");
  const names = [
    "episodio_uno.wav",
    "episodio_fallido.wav",
    "episodio_tres.wav",
  ];
  await page
    .getByLabel("Seleccionar varios archivos", { exact: true })
    .setInputFiles(names.map(phase1Audio));
  for (const name of names)
    await page
      .getByLabel(`Autor de ${name}`, { exact: true })
      .fill("Equipo QA");
  await page
    .getByRole("button", { name: "Guardar borradores", exact: true })
    .click();
  const table = page.getByRole("table");
  await expect(table.getByText("Borrador listo", { exact: true })).toHaveCount(
    2,
  );
  const failed = table.getByRole("row").filter({
    has: page.getByLabel("Título de episodio_fallido.wav", { exact: true }),
  });
  await expect(failed.getByRole("alert")).toContainText(
    "No se pudo registrar este audio de prueba.",
  );
  await failed.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(table.getByText("Borrador listo", { exact: true })).toHaveCount(
    3,
  );
  expect(
    phase.state.draftBatches.map((files) => files.map((file) => file.nombre)),
  ).toEqual([names, ["episodio_fallido.wav"]]);
  expect([...phase.state.uploadIntents].sort()).toEqual([...names].sort());
  expect(phase.state.uploads).toHaveLength(3);
  expect(phase.drafts.size).toBe(3);
});
