import { expect, test } from "@playwright/test";
import { setupPodcastMetadata as setup, podcastAudio } from "./fixtures/podcast-metadata-http";

test("4.9 · generar no modifica; aceptar permite editar y crear borrador con los endpoints existentes", async ({ page }) => {
  const qa = await setup(page);
  expect(qa.calls).toEqual([]);
  await expect(qa.panel.getByRole("button", { name: "Sugerir metadatos con IA" })).toBeDisabled();
  await page.getByLabel("Título", { exact: false }).fill("Crear hábitos sostenibles");
  await page.getByLabel("Autor", { exact: false }).fill("Ana Pérez");
  await page.getByLabel("Descripción", { exact: true }).fill("Descripción manual");
  await page.getByRole("textbox", { name: "Etiquetas", exact: true }).fill("manual");
  await qa.panel.getByLabel("Contexto editorial (opcional)").fill("Constancia y pequeños pasos.");
  await qa.panel.getByRole("button", { name: "Sugerir metadatos con IA" }).press("Enter");
  await expect(page.getByTestId("podcast-metadata-draft")).toContainText("qa-podcast-model");
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("Descripción manual");
  await expect(page.getByRole("textbox", { name: "Etiquetas", exact: true })).toHaveValue("manual");
  expect(qa.writes).toEqual([]);
  expect(qa.calls).toEqual([{ body: { title: "Crear hábitos sostenibles", language: "es", context: "Constancia y pequeños pasos." }, status: 200 }]);
  await qa.panel.getByRole("button", { name: "Usar sugerencias" }).click();
  await expect(page.getByLabel("Categoría", { exact: false })).toHaveValue("Habitos");
  await expect(page.getByLabel("Descripción", { exact: true })).toBeFocused();
  await page.getByLabel("Categoría", { exact: false }).selectOption("Mindfulness");
  await page.getByLabel("Descripción", { exact: true }).fill("Descripción final revisada");
  await page.getByRole("button", { name: "Quitar etiqueta constancia", exact: true }).click();
  await page.getByRole("textbox", { name: "Etiquetas", exact: true }).fill("revisado");
  await page.locator("#media-file").setInputFiles(podcastAudio());
  await expect(page.getByText("Leyendo metadata del archivo...")).toHaveCount(0);
  expect(qa.writes).toEqual([]);
  await page.getByRole("button", { name: "Crear medio", exact: true }).click();
  await expect(page).toHaveURL(/\/media(?:\?creado=1)?$/);
  await expect(page.getByText("Medio creado correctamente.", { exact: true })).toBeVisible();
  expect(qa.writes.map(w => w.path)).toEqual(["upload-intent", "storage", "create"]);
  expect(qa.writes[2].body).toMatchObject({ description: "Descripción final revisada", category: "Mindfulness", tags: ["hábitos", "revisado"], status: "Draft", storageKey: "media/podcasts/qa49.mp3" });
  expect(qa.errors).toEqual([]);
});

for (const missing of ["Media.Create", "Program.AiManage"]) test(`4.9 · Admin sin ${missing} no solicita ayuda`, async ({ page }) => {
  const qa = await setup(page, { missing });
  await expect(qa.panel).toHaveCount(0); expect(qa.calls).toEqual([]);
  await expect(page.getByLabel("Descripción", { exact: true })).toBeEditable();
});

for (const mode of ["unavailable", "403", "429", "500", "503", "invalid-category", "invalid-tags", "invalid-date", "invalid-estimate", "hostile"]) test(`4.9 · ${mode} conserva el formulario y permite reintentar`, async ({ page }) => {
  const qa = await setup(page, { mode });
  await page.getByLabel("Título", { exact: false }).fill("Pausa consciente");
  await page.getByLabel("Descripción", { exact: true }).fill("Contenido manual");
  await page.getByRole("textbox", { name: "Etiquetas", exact: true }).fill("pendiente");
  await qa.panel.getByRole("button", { name: "Sugerir metadatos con IA" }).click();
  await expect(qa.panel.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("podcast-metadata-draft")).toHaveCount(0);
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("Contenido manual");
  await expect(page.getByRole("textbox", { name: "Etiquetas", exact: true })).toHaveValue("pendiente");
  expect(qa.writes).toEqual([]); expect(await page.evaluate(() => "qaInjected" in window)).toBe(false);
  qa.setMode("ok");
  await qa.panel.getByRole("button", { name: "Sugerir metadatos con IA" }).click();
  await expect(page.getByTestId("podcast-metadata-draft")).toBeVisible();
  expect(qa.calls).toHaveLength(2); expect(qa.errors).toEqual([]);
});

test("4.9 · respuesta tardía y borrador anterior se invalidan al editar; doble clic no duplica", async ({ page }) => {
  const qa = await setup(page, { delay: 900 });
  await page.getByLabel("Título", { exact: false }).fill("Título inicial");
  const button = qa.panel.getByRole("button", { name: "Sugerir metadatos con IA" });
  await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect.poll(() => qa.calls.length).toBe(1);
  await page.getByLabel("Descripción", { exact: true }).fill("Edición durante generación");
  await expect.poll(() => qa.calls[0]?.status).toBe(200);
  await expect(page.getByTestId("podcast-metadata-draft")).toHaveCount(0);
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("Edición durante generación");
  await button.click();
  await expect(page.getByTestId("podcast-metadata-draft")).toBeVisible();
  await page.getByRole("textbox", { name: "Etiquetas", exact: true }).fill("edición posterior");
  await expect(page.getByTestId("podcast-metadata-draft")).toHaveCount(0);
  expect(qa.writes).toEqual([]); expect(qa.errors).toEqual([]);
});

test("4.9 · deshacer una edición no revive un intento abortado ni su borrador", async ({ page }) => {
  const qa = await setup(page, { delay: 900 });
  const title = page.getByLabel("Título", { exact: false });
  const generate = qa.panel.getByRole("button", { name: "Sugerir metadatos con IA" });
  await title.fill("Título original");
  await generate.click();
  await expect.poll(() => qa.calls.length).toBe(1);
  await title.fill("Título corregido");
  await title.fill("Título original");
  await expect(generate).toBeEnabled();
  await expect.poll(() => qa.calls[0]?.status).toBe(200);
  await expect(page.getByTestId("podcast-metadata-draft")).toHaveCount(0);
  await generate.click();
  await expect(page.getByTestId("podcast-metadata-draft")).toBeVisible();
  await title.fill("Otro título");
  await title.fill("Título original");
  await expect(page.getByTestId("podcast-metadata-draft")).toHaveCount(0);
  expect(qa.writes).toEqual([]); expect(qa.errors).toEqual([]);
});

test("4.9 · descartar y cancelar no guardan; título y contexto inválidos no salen a red", async ({ page }) => {
  const qa = await setup(page);
  const title = page.getByLabel("Título", { exact: false });
  const generate = qa.panel.getByRole("button", { name: "Sugerir metadatos con IA" });
  for (const value of [" ", "x".repeat(201), "https://example.invalid", "<b>Título</b>"]) {
    await title.fill(value); await expect(generate).toBeDisabled();
  }
  await title.fill("Título editorial");
  await qa.panel.getByLabel("Contexto editorial (opcional)").fill("https://example.invalid");
  await expect(generate).toBeDisabled(); expect(qa.calls).toEqual([]);
  await qa.panel.getByLabel("Contexto editorial (opcional)").fill("");
  await generate.click(); await expect(page.getByTestId("podcast-metadata-draft")).toBeVisible();
  await qa.panel.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page).toHaveURL(/\/media$/); expect(qa.writes).toEqual([]);
});

test("4.9 · error al guardar conserva campos aceptados y archivo para reintentar", async ({ page }) => {
  const qa = await setup(page);
  await page.getByLabel("Título", { exact: false }).fill("Pequeños pasos");
  await page.getByLabel("Autor", { exact: false }).fill("Ana Pérez");
  await page.locator("#media-file").setInputFiles(podcastAudio());
  await qa.panel.getByRole("button", { name: "Sugerir metadatos con IA" }).click();
  await qa.panel.getByRole("button", { name: "Usar sugerencias" }).click();
  qa.setFailSave(true);
  await page.getByRole("button", { name: "Crear medio", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Error sintético");
  await expect(page.getByLabel("Categoría", { exact: false })).toHaveValue("Habitos");
  await expect(page.locator("#media-file")).not.toHaveValue("");
  qa.setFailSave(false);
  await page.getByRole("button", { name: "Crear medio", exact: true }).click();
  await expect(page).toHaveURL(/\/media(?:\?creado=1)?$/);
  expect(qa.writes.filter(w => w.path === "create")).toHaveLength(2);
});

for (const english of [false, true]) test(`4.9 · ${english ? "EN" : "ES"} sin modelo, responsive y teclado`, async ({ page }) => {
  const qa = await setup(page, { english, mode: "no-model" });
  await page.getByLabel(english ? "Title" : "Título", { exact: false }).fill("Constancia");
  await qa.panel.getByRole("button", { name: english ? "Suggest metadata with AI" : "Sugerir metadatos con IA" }).click();
  const draft = page.getByTestId("podcast-metadata-draft");
  await expect(draft).toContainText(english ? "Estimated by AI" : "Estimado por IA");
  await expect(draft.locator("time")).toHaveAttribute("datetime", "2026-11-15T21:00:00Z");
  await expect(draft).not.toContainText("qa-podcast-model");
  expect(qa.calls[0].body).toMatchObject({ language: english ? "en" : "es" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await qa.panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `qa-reports/podcast-metadata/${english ? "en" : "es"}-${width}.png`, fullPage: true });
  }
  const use = draft.getByRole("button", { name: english ? "Use suggestions" : "Usar sugerencias" });
  await use.focus(); await expect(use).toBeFocused(); await page.keyboard.press("Enter");
  await expect(page.getByLabel(english ? "Category" : "Categoría", { exact: false })).toHaveValue("Habitos");
  expect(qa.writes).toEqual([]); expect(qa.errors).toEqual([]);
});
