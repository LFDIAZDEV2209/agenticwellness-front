import { expect, test, type Route } from "@playwright/test";
import {
  mockBienestarPhase1,
  phase1Audio,
} from "./fixtures/bienestar-fase1-http";

const reply = (route: Route, body: unknown) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body),
  });

test("1.28 · activa solo lectura, nueva versión pendiente y podcasts sin archivo fuera del contador", async ({
  page,
}, info) => {
  const http = await mockBienestarPhase1(page);
  http.template.status = "Active";
  http.podcast.storageKey = "media/podcasts/demo-copp.mp3";
  http.template.days = Array.from({ length: 7 }, (_, index) => ({
    id: `day-${index}`,
    weekday: index + 1,
    taskCode: "podcast",
    points: 80,
    sortOrder: 1,
    mediaId: index === 0 ? http.podcast.id : http.replacement.id,
    createdAt: "2026-11-14",
  }));
  await page.goto("/program/gestion?view=plantillas");
  await page.getByTitle("Ver detalles", { exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Plantilla de programa",
    exact: true,
  });
  await expect(dialog.getByRole("note")).toContainText(
    "Plantilla activa: solo lectura",
  );
  await expect(dialog.getByRole("note")).toContainText(
    "Crea un borrador con los 83 días de esta plantilla; la versión activa sigue vigente hasta publicar",
  );
  const version = dialog.getByRole("button", {
    name: "Crear nueva versión",
    exact: true,
  });
  await expect(version).toBeDisabled();
  await version.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Pendiente del backend");
  await expect(
    dialog.getByRole("button", { name: "Día 1", exact: true }),
  ).toContainText("Sin archivo");
  await expect(
    dialog
      .getByText("Días con podcast", { exact: true })
      .locator("..")
      .locator("dd"),
  ).toHaveText("71 / 83");
  await expect(dialog).not.toContainText("Arrastra para intercambiar");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("active-template-mobile.png"),
    animations: "disabled",
  });
  expect(http.state.publications).toHaveLength(0);
});

test("1.28 · preview ampliado comprueba huecos al abrir, agrupa y lleva al día sin publicar", async ({
  page,
}) => {
  const http = await mockBienestarPhase1(page);
  const huecos = [
    { day: 24, weekNumber: 4, weekday: 3, taskCode: "podcast" },
    { day: 24, weekNumber: 4, weekday: 3, taskCode: "ejercicio" },
    { day: 83, weekNumber: 12, weekday: 6, taskCode: "nut" },
  ];
  await page.route(/\/templates\/[^/]+\/publish\?preview=true$/, (route) =>
    reply(route, { ...http.impact, huecos }),
  );
  await page.goto("/program/gestion?view=plantillas");
  await page.getByTitle("Publicar", { exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Publicar la versión 2",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Publicar versión 2", exact: true }),
  ).toBeDisabled();
  const alert = dialog.getByRole("alert");
  await expect(
    alert.getByRole("heading", { name: "Podcast · 1", exact: true }),
  ).toBeVisible();
  await expect(
    alert.getByRole("heading", { name: "Ejercicio · 1", exact: true }),
  ).toBeVisible();
  await expect(
    alert.getByRole("heading", { name: "Plan nutricional · 1", exact: true }),
  ).toBeVisible();
  await alert.locator("summary").first().click();
  await alert
    .getByRole("button", {
      name: "Día 24 · Semana 4 · Miércoles · Podcast",
      exact: true,
    })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Plantilla de programa",
    exact: true,
  });
  await expect(
    editor.getByRole("button", { name: "Día 24", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(http.state.publications).toHaveLength(0);
});

test("1.28 · sustitución distingue activa, borrador y archivada; carga con estructura y aviso de espera", async ({
  page,
}) => {
  const http = await mockBienestarPhase1(page);
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/v1/media/${http.podcast.id}/retirement-impact`,
    async (route) => {
      await wait;
      return reply(route, { pacientes: 0, plantillas: 1 });
    },
  );
  const templates = [
    { id: http.template.id, name: "Borrador QA", status: "Draft" },
    { id: "active-qa", name: "Activa QA", status: "Active" },
    { id: "archived-qa", name: "Archivada QA", status: "Archived" },
  ];
  await page.route("**/api/v1/program/templates/*", (route) => {
    const row = templates.find((template) =>
      route.request().url().endsWith(template.id),
    );
    return row ? reply(route, { ...http.template, ...row }) : route.fallback();
  });
  await page.route(`**/api/v1/media/${http.podcast.id}/references`, (route) =>
    reply(route, {
      mediaId: http.podcast.id,
      totalReferences: 3,
      templateReferences: templates.map((row) => ({
        templateId: row.id,
        templateName: row.name,
        weekday: 1,
        points: 80,
      })),
      enrollmentReferences: [],
    }),
  );
  await page.goto(`/media/${http.podcast.id}`);
  await page.clock.install();
  await page.getByRole("button", { name: "Despublicar", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: `Despublicar «${http.podcast.title}»`,
    exact: true,
  });
  try {
    await expect(dialog.getByRole("status")).toContainText(
      "Consultando el impacto",
    );
    await expect(
      dialog.getByRole("heading", { name: "Dónde se usa", exact: true }),
    ).toBeVisible();
    await page.clock.fastForward(4001);
    await expect(dialog).toContainText(
      "La consulta está tardando más de lo habitual",
    );
  } finally {
    release();
  }
  await expect(dialog.locator("dd")).toHaveText(["0", "1"]);
  await expect(dialog).toContainText("Borrador QA · Borrador · no se modifica");
  await expect(dialog).toContainText(
    "Archivada QA · Archivada · no se modifica",
  );
  await expect(dialog).toContainText("Activa QA · Activa · se actualizará");
  await expect(dialog).toContainText("Los borradores no se modifican.");
  await dialog
    .getByRole("button", { name: "Elegir sustituto", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Elegir sustituto",
    exact: true,
  });
  await expect(picker).toContainText("Elige un único sustituto");
  await picker
    .getByRole("button", {
      name: `Seleccionar ${http.replacement.title}`,
      exact: true,
    })
    .click();
  await picker
    .getByRole("button", { name: "Usar como sustituto", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Despublicar y reemplazar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Cambios guardados", exact: true }),
  ).toContainText("Borrador QA");
  expect(http.template.status).toBe("Draft");
  expect(http.state.retirements).toHaveLength(1);
});

test("1.28 · pacientes exige rango explícito; selector marca sin archivo y ordena por lección", async ({
  page,
}) => {
  const http = await mockBienestarPhase1(page);
  const invalid = {
    ...http.podcast,
    id: "bad-audio",
    title: "Ep. 1 sin archivo",
    storageKey: "media/podcasts/demo-copp.mp3",
    sortOrder: 1,
  };
  const media = [
    invalid,
    { ...http.podcast, title: "Ep. 2 QA", sortOrder: 2 },
    { ...http.replacement, title: "Ep. 10 QA", sortOrder: 10 },
  ];
  const queries: URL[] = [];
  await page.route("**/api/v1/media?**", (route) => {
    queries.push(new URL(route.request().url()));
    return reply(route, {
      items: media,
      totalCount: media.length,
      page: 1,
      pageSize: 12,
      totalPages: 1,
    });
  });
  await page.goto("/patients?tab=estado-clinico");
  await page
    .getByRole("checkbox", { name: /^Seleccionar a / })
    .first()
    .check();
  await page
    .getByRole("button", { name: "Asignar podcast", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Asignar podcast en bloque",
    exact: true,
  });
  await expect(
    dialog.getByLabel("Desde la semana", { exact: true }),
  ).toHaveValue("0");
  await expect(
    dialog.getByLabel("Hasta la semana", { exact: true }),
  ).toHaveValue("0");
  await expect(dialog).not.toContainText(
    "La selección incluye pacientes de otras páginas o filtros.",
  );
  await dialog
    .getByRole("button", { name: "Elegir podcast", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Elegir podcast",
    exact: true,
  });
  await expect(
    picker.getByRole("button", {
      name: "Seleccionar Ep. 1 sin archivo",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(picker.getByRole("article").first()).toContainText(
    "Sin archivo · no se puede elegir",
  );
  expect(queries.at(-1)?.searchParams.get("sortBy")).toBe("sortOrder");
  await picker
    .getByRole("button", { name: "Seleccionar Ep. 2 QA", exact: true })
    .click();
  await picker.getByRole("button", { name: "Añadir 1", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Revisar asignación", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Desde la semana", { exact: true }).selectOption("3");
  await dialog.getByLabel("Hasta la semana", { exact: true }).selectOption("4");
  await expect(
    dialog.getByRole("button", { name: "Revisar asignación", exact: true }),
  ).toBeEnabled();
  expect(http.state.assignments).toHaveLength(0);
});

test("1.28 · tarjetas y tabla muestran uso y etiquetas; miniatura S3 pasa por firma", async ({
  page,
}) => {
  const http = await mockBienestarPhase1(page);
  http.podcast.usageCount = 3;
  http.podcast.tags = ["Respiración QA"];
  http.podcast.thumbnailKey =
    "https://qa-bucket.s3.us-east-1.amazonaws.com/media/miniatura%20QA.png";
  const keys: string[] = [],
    external: string[] = [];
  await page.route("**/*.amazonaws.com/**", (route) => {
    external.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/v1/storage/sign?**", (route) => {
    keys.push(new URL(route.request().url()).searchParams.get("key") ?? "");
    return reply(route, { url: `${new URL(page.url()).origin}/qa-thumb` });
  });
  await page.route("**/qa-thumb", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#085D66"/></svg>',
    }),
  );
  await page.goto("/media");
  await expect(page.getByText("En uso · 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Respiración QA", { exact: true })).toBeVisible();
  await expect.poll(() => keys.includes("media/miniatura QA.png")).toBe(true);
  expect(external).toHaveLength(0);
  await page
    .getByRole("button", { name: "Vista de tabla", exact: true })
    .click();
  await expect(
    page.getByRole("table").getByText("Respiración QA", { exact: true }),
  ).toBeVisible();
  await page.goto(`/media/${http.podcast.id}`);
  await expect(
    page.getByRole("heading", { name: http.podcast.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Día / Mes", { exact: true })).toHaveCount(0);
});

test("1.28 · lote detecta tipo y duplicado al entrar, exige autor y categoría y sube solo válido", async ({
  page,
}) => {
  const http = await mockBienestarPhase1(page);
  await page.goto("/media/new?mode=bulk");
  const file = phase1Audio("audio.wav");
  await page
    .getByLabel("Seleccionar varios archivos", { exact: true })
    .setInputFiles([
      {
        name: "notas.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("nota"),
      },
      file,
      file,
    ]);
  const table = page.getByRole("table", {
    name: "Archivos del lote",
    exact: true,
  });
  await expect(table).toContainText(
    "Selecciona archivos de audio para la biblioteca de podcasts.",
  );
  await expect(table).toContainText("Archivo duplicado en este lote.");
  await expect(
    page.getByRole("button", { name: "Guardar borradores", exact: true }),
  ).toBeDisabled();
  const author = page.getByLabel("Autor de audio.wav", { exact: true }).first();
  await expect(author).toHaveAttribute("aria-required", "true");
  await author.fill("Equipo QA");
  await expect(
    page.getByRole("button", { name: "Guardar borradores", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Categoría de audio.wav", { exact: true })
    .first()
    .selectOption("Habitos");
  await page
    .getByRole("button", { name: "Guardar borradores", exact: true })
    .click();
  await expect.poll(() => http.state.draftBatches.length).toBe(1);
  expect(http.state.draftBatches[0]).toHaveLength(1);
  expect(http.state.uploadIntents).toEqual(["audio.wav"]);
});
