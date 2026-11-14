import { expect, test, type Page } from "@playwright/test";
import { mockPatientsHttp } from "./fixtures/patients-http";
import type { MediaItem } from "../features/media/types";

const original: MediaItem = {
  id: "retirement-original",
  title: "Ep. 9 · Sueño y apetito",
  author: "Equipo QA",
  description: null,
  category: "Nutricion",
  mediaType: "Podcast",
  status: "Published",
  storageKey: "media/original.mp3",
  thumbnailKey: null,
  contentType: "audio/mpeg",
  fileSizeBytes: 12000,
  durationSecs: 60,
  sortOrder: 9,
  day: 0,
  month: 0,
  publishedAt: "2026-11-14",
  createdAt: "2026-11-14",
  createdBy: null,
  updatedAt: null,
};

/** Reproduce los endpoints y el 409 de da645bb; ninguna mutación sale al backend real. */
async function fixture(
  page: Page,
  options: {
    english?: boolean;
    unused?: boolean;
    deleteBlocked?: boolean;
    race?: boolean;
    invalid?: boolean;
    empty?: boolean;
    previewFailed?: boolean;
    viewOnly?: boolean;
    demo?: boolean;
  } = {},
) {
  await mockPatientsHttp(page, {
    english: options.english,
    permissions: [
      "Media.View",
      ...(options.viewOnly
        ? []
        : ["Media.Publish", "Media.Archive", "Media.Delete"]),
    ],
  });
  const media: MediaItem = {
    ...original,
    ...(options.demo
      ? {
          mediaType: "Video" as const,
          storageKey: "media/demo.mp4",
          contentType: "video/mp4",
          title: "Marcha en el lugar",
        }
      : {}),
  };
  const replacement: MediaItem = {
    ...media,
    id: "retirement-replacement",
    title: options.demo
      ? "Marcha con elevación de rodillas"
      : "Hidratación y apetito",
    storageKey: options.demo
      ? "media/replacement.mp4"
      : "media/replacement.mp3",
  };
  const candidates: MediaItem[] = [
    media,
    replacement,
    {
      ...replacement,
      id: "wrong-type",
      title: "Tipo incompatible",
      mediaType: options.demo ? "Image" : "Video",
    },
    {
      ...replacement,
      id: "draft",
      title: "Borrador no elegible",
      status: "Draft",
    },
    {
      ...replacement,
      id: "placeholder",
      title: "Placeholder no elegible",
      storageKey: "media/podcasts/demo-copp.mp3",
    },
  ];
  const state = {
    impact: {
      pacientes: options.unused || options.race ? 0 : 48,
      plantillas: options.unused || options.race ? 0 : 2,
    },
    previewFailed: options.previewFailed ?? false,
    race: options.race ?? false,
    invalid: options.invalid ?? false,
    empty: options.empty ?? false,
    hold: false,
    deleted: false,
    previews: 0,
    calls: [] as {
      method: string;
      operation: string;
      replacementMediaId: string | null;
    }[],
  };
  await page.route("**/api/v1/storage/sign**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ url: "/qa-retirement-preview" }),
    }),
  );
  await page.route("**/qa-retirement-preview", (route) =>
    route.fulfill({
      contentType: options.demo ? "video/mp4" : "audio/mpeg",
      body: "",
    }),
  );
  await page.route("**/api/v1/media**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname.endsWith("/retirement-impact")) {
      state.previews++;
      return state.previewFailed
        ? reply({ detail: "Impacto no disponible" }, 503)
        : reply(state.impact);
    }
    if (url.pathname.endsWith("/references"))
      return reply({
        mediaId: media.id,
        totalReferences: options.unused || options.race ? 0 : 3,
        templateReferences:
          options.unused || options.race
            ? []
            : [
                {
                  templateId: "template-qa",
                  templateName: "Programa base 83 días",
                  weekday: 1,
                  points: 100,
                },
              ],
        enrollmentReferences: [],
        routineReferences: options.demo
          ? [
              {
                routineId: "routine-qa",
                routineName: "Caminata progresiva",
                exerciseId: null,
                exerciseName: null,
              },
            ]
          : [],
      });
    if (request.method() === "DELETE" || request.method() === "POST") {
      const operation =
        request.method() === "DELETE"
          ? "delete"
          : url.pathname.split("/").at(-1)!;
      const replacementMediaId =
        request.method() === "DELETE"
          ? url.searchParams.get("replacementMediaId")
          : (request.postDataJSON()?.replacementMediaId ?? null);
      state.calls.push({
        method: request.method(),
        operation,
        replacementMediaId,
      });
      while (state.hold)
        await new Promise((resolve) => setTimeout(resolve, 20));
      if (state.invalid) {
        state.invalid = false;
        return reply(
          {
            status: 422,
            detail:
              "MEDIA_REPLACEMENT_INVALID: el sustituto debe ser otro medio publicado y del mismo tipo.",
          },
          422,
        );
      }
      if (state.race || (options.deleteBlocked && operation === "delete")) {
        state.race = false;
        state.impact = { pacientes: 48, plantillas: 2 };
        return reply(
          {
            type: "https://httpstatuses.io/409",
            title: "Conflict",
            status: 409,
            detail:
              "MEDIA_REPLACEMENT_REQUIRED: exige sustituto publicado para referencias activas. DELETE conserva el bloqueo mientras existan referencias históricas o individuales.",
            impact: state.impact,
          },
          409,
        );
      }
      if (operation === "delete") {
        state.deleted = true;
        return route.fulfill({ status: 204 });
      }
      media.status = operation === "archive" ? "Archived" : "Draft";
      return reply({ ...media, retirementImpact: state.impact });
    }
    if (url.pathname.endsWith(`/${media.id}`)) return reply(media);
    if (url.pathname.endsWith(`/${replacement.id}`)) return reply(replacement);
    // Se devuelve una mezcla deliberada para comprobar la defensa del selector por destino.
    const items =
      url.searchParams.get("status") === "Published"
        ? state.empty
          ? [media]
          : candidates
        : state.deleted
          ? []
          : [media];
    return reply({
      items,
      totalCount: items.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });
  const open = async (
    action: "unpublish" | "archive" | "delete" = "unpublish",
  ) => {
    if (action === "delete") {
      await page.goto("/media");
      await page
        .getByRole("button", {
          name: `Acciones de ${media.title}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitem", { name: "Eliminar", exact: true })
        .click();
    } else {
      await page.goto(`/media/${media.id}`);
      await page
        .getByRole("button", {
          name:
            action === "archive"
              ? options.english
                ? "Archive"
                : "Archivar"
              : options.english
                ? "Unpublish"
                : "Despublicar",
          exact: true,
        })
        .click();
    }
    return page.getByRole("dialog", {
      name: `${action === "delete" ? "Eliminar" : action === "archive" ? (options.english ? "Archive" : "Archivar") : options.english ? "Unpublish" : "Despublicar"} «${media.title}»`,
      exact: true,
    });
  };
  const choose = async () => {
    const label = options.english ? "Choose replacement" : "Elegir sustituto";
    await page.getByRole("button", { name: label, exact: true }).click();
    const picker = page.getByRole("dialog", { name: label, exact: true });
    await expect(
      picker.getByRole("button", {
        name: `${options.english ? "Select" : "Seleccionar"} ${media.title}`,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      picker.getByText("Tipo incompatible", { exact: true }),
    ).toHaveCount(0);
    await expect(
      picker.getByText("Borrador no elegible", { exact: true }),
    ).toHaveCount(0);
    await expect(
      picker.getByRole("button", { name: `${options.english ? "Select" : "Seleccionar"} Placeholder no elegible`, exact: true }),
    ).toBeDisabled();
    await picker
      .getByRole("button", {
        name: `${options.english ? "Select" : "Seleccionar"} ${replacement.title}`,
        exact: true,
      })
      .click();
    await picker
      .getByRole("button", {
        name: options.english ? "Use as replacement" : "Usar como sustituto",
        exact: true,
      })
      .click();
    await expect(picker).not.toBeVisible();
    await page
      .locator('[data-slot="dialog-content"][data-closed]')
      .waitFor({ state: "detached" });
    return picker;
  };
  return { media, replacement, state, open, choose };
}

test("1.23 · despublicar exige sustituto, filtra candidatos y muestra impacto confirmado", async ({
  page,
}, testInfo) => {
  const http = await fixture(page);
  const dialog = await http.open();
  await expect(
    dialog.getByRole("button", { name: "Despublicar", exact: true }),
  ).toBeDisabled();
  await expect(dialog.locator("dd")).toHaveText(["48", "2"]);
  await expect(dialog).toContainText("Programa base 83 días");
  expect(http.state.calls).toHaveLength(0);
  await http.choose();
  await expect(dialog.locator("audio")).toHaveAttribute(
    "src",
    /qa-retirement-preview$/,
  );
  await page.screenshot({
    path: testInfo.outputPath("retirement-desktop.png"),
  });
  await dialog
    .getByRole("button", { name: "Despublicar y reemplazar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Cambios guardados", exact: true }),
  ).toContainText("Impacto confirmado: 48 pacientes y 2 plantillas.");
  expect(http.state.calls).toEqual([
    {
      method: "POST",
      operation: "unpublish",
      replacementMediaId: http.replacement.id,
    },
  ]);
  expect(http.media.status).toBe("Draft");
});

test("1.23 · DELETE 409 conserva historial y permite archivar con el sustituto", async ({
  page,
}, testInfo) => {
  const http = await fixture(page, { deleteBlocked: true });
  const dialog = await http.open("delete");
  await http.choose();
  await dialog
    .getByRole("button", { name: "Eliminar y reemplazar", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "No se aplicaron cambios.",
  );
  await expect(
    dialog.getByRole("button", { name: "Eliminar y reemplazar", exact: true }),
  ).toBeDisabled();
  expect(http.state.deleted).toBe(false);
  expect(http.media.status).toBe("Published");
  await page.screenshot({
    path: testInfo.outputPath("retirement-delete-blocked.png"),
  });
  await dialog
    .getByRole("button", { name: "Archivar en su lugar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Archivar y reemplazar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Cambios guardados", exact: true }),
  ).toBeVisible();
  expect(http.state.calls.map((call) => call.operation)).toEqual([
    "delete",
    "archive",
  ]);
  expect(
    http.state.calls.every(
      (call) => call.replacementMediaId === http.replacement.id,
    ),
  ).toBe(true);
  expect(http.media.status).toBe("Archived");
});

test("1.23 · sin uso permite eliminar sin enviar un sustituto", async ({
  page,
}) => {
  const http = await fixture(page, { unused: true });
  const dialog = await http.open("delete");
  const confirm = dialog.getByRole("button", { name: "Eliminar", exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.getByRole("dialog", { name: "Cambios guardados", exact: true }),
  ).toContainText("Eliminado");
  expect(http.state.calls).toEqual([
    { method: "DELETE", operation: "delete", replacementMediaId: null },
  ]);
  expect(http.state.deleted).toBe(true);
});

test("1.23 · carrera 409 actualiza conteos y un sustituto caducado 422 exige nueva selección", async ({
  page,
}) => {
  const http = await fixture(page, { race: true });
  const dialog = await http.open("archive");
  await expect(
    dialog.getByRole("button", { name: "Archivar", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("referencias activas");
  await expect(dialog.locator("dd")).toHaveText(["48", "2"]);
  await expect(
    dialog.getByRole("button", { name: "Archivar", exact: true }),
  ).toBeDisabled();
  await http.choose();
  http.state.invalid = true;
  await dialog
    .getByRole("button", { name: "Archivar y reemplazar", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "El sustituto ya no es válido.",
  );
  await expect(
    dialog.getByRole("button", { name: "Archivar", exact: true }),
  ).toBeDisabled();
  await http.choose();
  await dialog
    .getByRole("button", { name: "Archivar y reemplazar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Cambios guardados", exact: true }),
  ).toBeVisible();
  expect(http.state.calls).toHaveLength(3);
});

test("1.23 · impacto fallido recuperable y catálogo sin candidatos mantienen el bloqueo", async ({
  page,
}) => {
  const http = await fixture(page, { previewFailed: true, empty: true });
  const dialog = await http.open();
  await expect(dialog.getByRole("alert")).toContainText(
    "No se pudo cargar el impacto",
  );
  await expect(
    dialog.getByRole("button", { name: "Despublicar", exact: true }),
  ).toBeDisabled();
  http.state.previewFailed = false;
  await dialog.getByRole("button", { name: "Reintentar", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Elegir sustituto", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Elegir sustituto",
    exact: true,
  });
  await expect(picker).toContainText("Sin resultados con los filtros");
  await expect(
    picker.getByRole("button", { name: "Usar como sustituto", exact: true }),
  ).toBeDisabled();
  await picker.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Despublicar", exact: true }),
  ).toBeDisabled();
  expect(http.state.calls).toHaveLength(0);
});

test("1.23 · demostración usa destino Rutinas y exige el mismo tipo publicado", async ({
  page,
}) => {
  const http = await fixture(page, { demo: true });
  const dialog = await http.open("archive");
  await expect(dialog).toContainText("Caminata progresiva");
  await http.choose();
  await expect(dialog.locator("video")).toHaveAttribute(
    "src",
    /qa-retirement-preview$/,
  );
  await dialog
    .getByRole("button", { name: "Archivar y reemplazar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Cambios guardados", exact: true }),
  ).toBeVisible();
  expect(http.state.calls[0].replacementMediaId).toBe(http.replacement.id);
});

test("1.23 · petición en curso no se cierra ni se envía dos veces", async ({
  page,
}) => {
  const http = await fixture(page);
  const dialog = await http.open();
  await http.choose();
  const confirm = dialog.getByRole("button", {
    name: "Despublicar y reemplazar",
    exact: true,
  });
  http.state.hold = true;
  try {
    await confirm.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(
      dialog.getByRole("button", { name: "Procesando...", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Cancelar", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(http.state.calls).toHaveLength(1);
  } finally {
    http.state.hold = false;
  }
  await expect(
    page.getByRole("dialog", { name: "Cambios guardados", exact: true }),
  ).toBeVisible();
});

test("1.23 · inglés a 320px, selección por teclado y cancelar sin mutaciones", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const http = await fixture(page, { english: true });
  const dialog = await http.open();
  await expect(dialog.locator("dd")).toHaveText(["48", "2"]);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await http.choose();
  await expect(
    dialog.getByRole("button", { name: "Unpublish and replace", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("retirement-mobile-en.png"),
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  expect(http.state.calls).toHaveLength(0);
});

test("1.23 · lectura no permite retirar ni consulta el impacto", async ({
  page,
}) => {
  const http = await fixture(page, { viewOnly: true });
  await page.goto(`/media/${http.media.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: http.media.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Despublicar", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Archivar", exact: true }),
  ).toHaveCount(0);
  expect(http.state.previews).toBe(0);
  expect(http.state.calls).toHaveLength(0);
});
