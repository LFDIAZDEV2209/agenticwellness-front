import { test, expect, type Page } from "@playwright/test";
import {
  mockCycleClosingHttp,
  nextPlanId,
} from "./fixtures/nutrition-cycle-closing-http";
import { intakePatient } from "./fixtures/nutrition-intake-http";
import { reviewCycleId } from "./fixtures/nutrition-cycle-review-http";
test.use({ timezoneId: "Asia/Tokyo" });
const notes = (p: Page) =>
  p.getByRole("textbox", {
    name: "Evaluación interna (obligatoria para publicar)",
    exact: true,
  });
const spanish = (p: Page) =>
  p.getByRole("textbox", {
    name: "Mensaje al paciente · Español",
    exact: true,
  });
const english = (p: Page) =>
  p.getByRole("textbox", {
    name: "Mensaje al paciente · English",
    exact: true,
  });
const save = (p: Page) =>
  p.getByRole("button", { name: "Guardar y retomar luego", exact: true });
const publish = (p: Page) =>
  p.getByRole("button", { name: "Publicar plan y mensaje", exact: true });
const preview = (p: Page) =>
  p.getByLabel("Vista previa para el paciente", { exact: true });
async function open(p: Page) {
  await p.goto(`/nutrition/${intakePatient}?tab=cierre`);
  await expect(notes(p)).toBeVisible();
}
async function fill(p: Page) {
  await notes(p).fill("Nota privada: evaluar cobertura.");
  await spanish(p).fill("Mantén el plan acordado.");
  await english(p).fill("Keep following the agreed plan.");
  await save(p).click();
  await expect(
    p.getByText("Cierre guardado. Puedes retomarlo más tarde.", {
      exact: true,
    }),
  ).toBeVisible();
}
async function choose(p: Page) {
  await p
    .getByRole("combobox", {
      name: "Borrador del siguiente ciclo",
      exact: true,
    })
    .selectOption(nextPlanId);
  const dialog = p.getByRole("dialog", {
    name: "Preparar el siguiente plan",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Usar este plan en el cierre", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
}
async function ready(p: Page) {
  await fill(p);
  await choose(p);
  await p
    .getByRole("checkbox", {
      name: "Revisé personalmente las alertas y la validación del plan siguiente.",
      exact: true,
    })
    .check();
  await save(p).click();
  await expect(publish(p)).toBeEnabled();
}
const image = {
  name: "example.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF7sAAAAASUVORK5CYII=",
    "base64",
  ),
};

test("3.17 · guardar manual, retomar, privacidad y publicación conjunta una sola vez", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page);
  await open(page);
  await expect(
    page.getByRole("button", { name: "Generar borrador de IA", exact: true }),
  ).toBeEnabled();
  await expect(publish(page)).toBeDisabled();
  await fill(page);
  expect(http.closingState.review?.revision).toBe(1);
  await page.reload();
  await expect(notes(page)).toHaveValue("Nota privada: evaluar cobertura.");
  await choose(page);
  await page
    .getByRole("checkbox", {
      name: "Revisé personalmente las alertas y la validación del plan siguiente.",
      exact: true,
    })
    .check();
  await save(page).click();
  await expect(preview(page)).toContainText("Mantén el plan acordado.");
  await expect(preview(page)).not.toContainText("Nota privada");
  await publish(page).click();
  await page
    .getByRole("dialog", {
      name: "¿Publicar el plan siguiente y el mensaje?",
      exact: true,
    })
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  expect(http.closingState.publishedPlans).toBe(0);
  await publish(page).click();
  const confirm = page.getByRole("button", {
    name: "Confirmar publicación conjunta",
    exact: true,
  });
  await confirm.dblclick();
  await expect(
    page.getByText("Plan y mensaje publicados", { exact: true }),
  ).toBeVisible();
  expect(http.closingState.publishedPlans).toBe(1);
  expect(http.closingState.notifications).toBe(1);
  expect(
    http.closingState.writes.filter((w) => w.path.endsWith("/publish")),
  ).toHaveLength(1);
  expect(
    http.closingState.writes.find((w) => w.path.endsWith("/publish"))?.body,
  ).toEqual({
    revision: 2,
    nextPrescriptionId: nextPlanId,
    nextPrescriptionRevision: 4,
  });
  expect(
    http.closingState.writes.some((w) => w.path.endsWith("/approve")),
  ).toBe(false);
  await page.reload();
  await expect(notes(page)).toBeDisabled();
  await expect(spanish(page)).toHaveValue("Mantén el plan acordado.");
});

test("3.17 · revisión incompleta bloquea publicar y cambios locales bloquean la salida", async ({
  page,
}) => {
  await mockCycleClosingHttp(page);
  await open(page);
  await notes(page).fill("Evaluación parcial");
  await expect(publish(page)).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Volver a la ficha", exact: true }),
  ).toBeDisabled();
  await save(page).click();
  await expect(
    page.getByRole("button", { name: "Volver a la ficha", exact: true }),
  ).toBeEnabled();
  await expect(publish(page)).toBeDisabled();
  await spanish(page).fill("Borrador sin guardar");
  await page
    .getByRole("button", { name: "Descartar cambios locales", exact: true })
    .click();
  await expect(spanish(page)).toHaveValue("");
});

test("3.17 · adjuntos multipart privados, imagen visible con pie y borrado con revisión", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page);
  await open(page);
  await fill(page);
  await page
    .getByLabel("Archivo · JPEG, PNG, WebP o PDF · máximo 10 MB", {
      exact: true,
    })
    .setInputFiles(image);
  await page
    .getByLabel("Pie del adjunto (opcional)", { exact: true })
    .fill("Ejemplo interno");
  await page
    .getByRole("button", { name: "Guardar adjunto", exact: true })
    .click();
  await expect(
    page.getByText("Ejemplo interno", { exact: true }),
  ).toBeVisible();
  await expect(preview(page).getByRole("img")).toHaveCount(0);
  expect(http.closingState.review?.attachments[0].visibleToPatient).toBe(false);
  expect(http.closingState.uploads[0]).toContain('name="revision"\r\n\r\n1');
  await page
    .getByLabel("Archivo · JPEG, PNG, WebP o PDF · máximo 10 MB", {
      exact: true,
    })
    .setInputFiles({ ...image, name: "visible.png" });
  await page
    .getByLabel("Pie del adjunto (opcional)", { exact: true })
    .fill("Plato que verá el paciente");
  await page
    .getByRole("checkbox", {
      name: "Mostrar esta imagen y su pie al paciente al publicar",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Guardar adjunto", exact: true })
    .click();
  await expect(
    preview(page).getByRole("img", {
      name: "Plato que verá el paciente",
      exact: true,
    }),
  ).toBeVisible();
  await expect(preview(page)).toContainText("Plato que verá el paciente");
  await expect(preview(page)).not.toContainText("Ejemplo interno");
  await page
    .getByRole("button", { name: "Quitar adjunto", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirmar quitar adjunto", exact: true })
    .click();
  await expect(page.locator(".nutrition-closing-attachments > li")).toHaveCount(
    1,
  );
  expect(
    http.closingState.writes.find((w) => w.method === "DELETE")?.path,
  ).toBe(
    `/api/v1/nutrition/cycles/${reviewCycleId}/review/attachments/synthetic-attachment-1`,
  );
  expect(http.closingState.review?.revision).toBe(4);
});

test("3.17 · PDF interno y archivo inválido no se publican como imágenes", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page);
  await open(page);
  await fill(page);
  const input = page.getByLabel(
    "Archivo · JPEG, PNG, WebP o PDF · máximo 10 MB",
    { exact: true },
  );
  await input.setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await page
    .getByRole("button", { name: "Guardar adjunto", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Selecciona un JPEG" }),
  ).toContainText("Selecciona un JPEG");
  expect(http.closingState.uploads).toHaveLength(0);
  await input.setInputFiles({
    name: "guide.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nsynthetic"),
  });
  await expect(
    page.getByRole("checkbox", {
      name: "Mostrar esta imagen y su pie al paciente al publicar",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Guardar adjunto", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Descargar documento interno",
      exact: true,
    }),
  ).toBeVisible();
  await expect(preview(page).getByRole("img")).toHaveCount(0);
});

test("3.17 · carga fallida del cierre y planes con reintento independiente", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page, { failRead: true });
  await page.goto(`/nutrition/${intakePatient}?tab=cierre`);
  await expect(
    page.getByRole("alert").filter({ hasText: "No pudimos cargar el cierre" }),
  ).toContainText("No pudimos cargar el cierre");
  await expect(
    page.getByRole("region", { name: "Resumen del período", exact: true }),
  ).toContainText("1.350 kcal");
  http.closingState.failRead = false;
  http.closingState.failPlans = true;
  await page
    .getByRole("button", { name: "Reintentar cierre", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No pudimos cargar los planes" }),
  ).toContainText("No pudimos cargar los planes");
  http.closingState.failPlans = false;
  await page
    .getByRole("button", { name: "Reintentar planes", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", {
      name: "Borrador del siguiente ciclo",
      exact: true,
    }),
  ).toBeVisible();
});

test("3.17 · 409 conserva textos, bloquea reescritura y permite reconciliar", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page);
  await open(page);
  await fill(page);
  await notes(page).fill("Cambios locales conservados");
  http.closingState.review!.revision++;
  http.closingState.review!.professionalNotes = "Edición de otro profesional";
  await save(page).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Conservamos tus textos" }),
  ).toContainText("Conservamos tus textos");
  await expect(notes(page)).toHaveValue("Cambios locales conservados");
  await expect(save(page)).toBeDisabled();
  await page
    .getByRole("button", { name: "Comprobar estado del cierre", exact: true })
    .click();
  await expect(save(page)).toBeEnabled();
  await expect(notes(page)).toHaveValue("Cambios locales conservados");
  await page
    .getByText("Ver textos guardados en el servidor", { exact: true })
    .click();
  await expect(
    page.getByText("Edición de otro profesional", { exact: true }),
  ).toBeVisible();
  await save(page).click();
  expect(http.closingState.review?.revision).toBe(3);
});

test("3.17 · publicación con respuesta perdida se consulta antes de reintentar", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page);
  await open(page);
  await ready(page);
  http.closingState.lostPublishResponse = true;
  await publish(page).click();
  await page
    .getByRole("button", {
      name: "Confirmar publicación conjunta",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect(publish(page)).toBeDisabled();
  await page
    .getByRole("button", { name: "Comprobar estado del cierre", exact: true })
    .click();
  await expect(
    page.getByText("Plan y mensaje publicados", { exact: true }),
  ).toBeVisible();
  expect(http.closingState.publishedPlans).toBe(1);
  expect(
    http.closingState.writes.filter((w) => w.path.endsWith("/publish")),
  ).toHaveLength(1);
});

test("3.17 · crear con base anterior, editor y enviar sin publicar por separado", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page, { noPlan: true });
  await open(page);
  await fill(page);
  await page
    .getByRole("button", {
      name: "Crear siguiente plan con el anterior como base",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Preparar el siguiente plan",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Enviar plan a aprobación", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Usar este plan en el cierre", exact: true })
    .click();
  await expect(
    page.getByText("Plan siguiente listo para la publicación conjunta.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    http.closingState.writes.filter((w) => w.path.endsWith("/prescriptions")),
  ).toHaveLength(1);
  const copied = http.closingState.writes.find((w) => w.path.endsWith("/save"))
    ?.body as { edit: { meals: unknown[] } };
  expect(copied.edit.meals).toHaveLength(120);
  expect(http.closingState.publishedPlans).toBe(0);
  await expect(page).not.toHaveURL(/prescriptionId=synthetic-next-plan/);
});

test("3.17 · sin aprobación o fotos se respetan capacidades", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page, {
    noApprove: true,
    noPhotos: true,
  });
  await open(page);
  await expect(notes(page)).toBeDisabled();
  await expect(publish(page)).toBeDisabled();
  await expect(
    page.getByText(
      "No tienes permiso para consultar ni adjuntar fotos y documentos de este cierre.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(http.closingState.photoRequests).toBe(0);
  expect(http.closingState.writes).toEqual([]);
});

test("3.17 · borrador de IA opaco no puede confirmarse ni publicarse sin revisión", async ({
  page,
}) => {
  await mockCycleClosingHttp(page, { aiDraft: true, published: false });
  await open(page);
  await fill(page);
  await expect(
    page.getByRole("button", { name: "Generar borrador de IA", exact: true }),
  ).toBeEnabled();
  await expect(publish(page)).toBeDisabled();
});

test("3.17 · IA real a pedido, sin copia automática, edición y confirmación explícitas", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page);
  await open(page);
  await page
    .getByRole("button", { name: "Generar borrador de IA", exact: true })
    .click();
  await expect(
    page.getByText("Resumen propuesto con datos del período.", { exact: true }),
  ).toBeVisible();
  await expect(spanish(page)).toHaveValue("");
  expect(http.closingState.review?.revision).toBe(1);
  await page
    .getByRole("button", {
      name: "Usar la propuesta como base del mensaje",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Copiar propuesta para editar", exact: true })
    .click();
  await expect(spanish(page)).toHaveValue("Propuesta IA para revisar.");
  const ack = page.getByRole("checkbox", {
    name: "Revisé el borrador de IA y la redacción final es mi responsabilidad profesional.",
    exact: true,
  });
  await expect(ack).toBeDisabled();
  await notes(page).fill("Evaluación profesional propia.");
  await spanish(page).fill("Mensaje final revisado por el profesional.");
  await english(page).fill("Final message reviewed by the professional.");
  await ack.check();
  await save(page).click();
  expect(http.closingState.review?.aiDraftConfirmed).toBe(true);
  await choose(page);
  await page
    .getByRole("checkbox", {
      name: "Revisé personalmente las alertas y la validación del plan siguiente.",
      exact: true,
    })
    .check();
  await save(page).click();
  await expect(publish(page)).toBeEnabled();
  const request = http.closingState.writes.find((w) =>
    w.path.endsWith("/review/ai-draft"),
  )!;
  expect(request.body).toEqual({ revision: 0, language: "es" });
  await expect(preview(page)).not.toContainText("Resumen propuesto con datos");
});

test("3.17 · IA indisponible permite continuar manual sin inventar borrador", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page);
  http.aiState.status = "unavailable";
  await open(page);
  await page
    .getByRole("button", { name: "Generar borrador de IA", exact: true })
    .click();
  await expect(
    page.getByText(
      "El resumen de IA no está disponible. Puedes continuar la revisión manual.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(http.closingState.review).toBeNull();
  await ready(page);
  await expect(publish(page)).toBeEnabled();
});

test("3.17 · IA insuficiente conserva consulta y no exige confirmar texto vacío", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page);
  http.aiState.status = "insufficient";
  await open(page);
  await page
    .getByRole("button", { name: "Generar borrador de IA", exact: true })
    .click();
  await expect(
    page.getByText(
      "No hay datos suficientes para un borrador. Continúa la revisión manual; no hay texto de IA que confirmar.",
      { exact: true },
    ),
  ).toBeVisible();
  await ready(page);
  await expect(publish(page)).toBeEnabled();
  expect(http.closingState.review?.aiDraftConfirmed).toBe(false);
});

test("3.17 · cancelar IA comprueba estado y conserva la revisión manual", async ({
  page,
}) => {
  const http = await mockCycleClosingHttp(page);
  http.aiState.delay = true;
  await open(page);
  await page
    .getByRole("button", { name: "Generar borrador de IA", exact: true })
    .click();
  await expect(
    page.getByText(
      "La consulta está en curso. No se ha copiado contenido al mensaje del paciente.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancelar consulta de IA", exact: true })
    .click();
  await expect.poll(() => http.aiState.aborted).toBe(true);
  http.aiState.release();
  await page
    .getByRole("button", { name: "Comprobar estado del cierre", exact: true })
    .click();
  await expect(notes(page)).toBeEnabled();
  expect(http.closingState.review).toBeNull();
});

test("3.17 · revisión inexistente 204 inicia un cierre vacío válido", async ({
  page,
}) => {
  await mockCycleClosingHttp(page);
  await page.route("**/nutrition/cycles/*/review", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 204 })
      : route.fallback(),
  );
  await open(page);
  await expect(notes(page)).toHaveValue("");
  await expect(save(page)).toBeEnabled();
});

test("3.17 · un borrador IA nuevo invalida la confirmación anterior sin perder textos locales", async ({ page }) => {
  const http = await mockCycleClosingHttp(page);
  await open(page);
  await page.getByRole("button", { name: "Generar borrador de IA", exact: true }).click();
  await expect(page.getByText("Resumen propuesto con datos del período.", { exact: true })).toBeVisible();
  await fill(page);
  const ack = page.getByRole("checkbox", {
    name: "Revisé el borrador de IA y la redacción final es mi responsabilidad profesional.", exact: true,
  });
  await ack.check();
  await save(page).click();
  await notes(page).fill("Evaluación local conservada");
  http.closingState.review!.revision++;
  http.closingState.review!.aiDraft = {
    ...(http.closingState.review!.aiDraft as object),
    summary: "Nueva propuesta de otro profesional", inputHash: "b".repeat(64),
  };
  http.closingState.review!.aiDraftConfirmed = false;
  await page.getByRole("button", { name: "Comprobar estado del cierre", exact: true }).click();
  await expect(page.getByText("Nueva propuesta de otro profesional", { exact: true })).toBeVisible();
  await expect(notes(page)).toHaveValue("Evaluación local conservada");
  await expect(ack).not.toBeChecked();
  await expect(publish(page)).toBeDisabled();
});

test("3.17 · regenerar IA conserva evaluación y mensaje e invalida su confirmación", async ({ page }) => {
  const http = await mockCycleClosingHttp(page);
  await open(page);
  await page.getByRole("button", { name: "Generar borrador de IA", exact: true }).click();
  await expect(page.getByText("Resumen propuesto con datos del período.", { exact: true })).toBeVisible();
  await fill(page);
  const ack = page.getByRole("checkbox", {
    name: "Revisé el borrador de IA y la redacción final es mi responsabilidad profesional.", exact: true,
  });
  await ack.check();
  await save(page).click();
  const revision = http.closingState.review!.revision;
  await page.getByRole("button", { name: "Volver a generar borrador de IA", exact: true }).click();
  await expect.poll(() => http.closingState.review!.revision).toBe(revision + 1);
  await expect(ack).not.toBeChecked();
  await expect(notes(page)).toHaveValue("Nota privada: evaluar cobertura.");
  await expect(spanish(page)).toHaveValue("Mantén el plan acordado.");
});
