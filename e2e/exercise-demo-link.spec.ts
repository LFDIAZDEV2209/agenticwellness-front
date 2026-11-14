import { expect, test } from "@playwright/test";
import { mockExerciseDemo } from "./fixtures/exercise-demo-http";

test("2.20b · valida un solo vídeo y adjunta el enlace publicado, sin firmar ni descargar", async ({
  page,
}, info) => {
  const http = await mockExerciseDemo(page);
  await page.goto("/wellness/exercise-routines/new");
  await page.locator("#routine-name").fill("Rutina con enlace QA");
  await page
    .getByRole("button", { name: "Agregar ejercicio", exact: true })
    .click();
  await page
    .getByLabel("Nombre del ejercicio *")
    .fill("Movimiento con enlace QA");
  const link = page.getByLabel("Enlace único de YouTube o Vimeo", {
    exact: true,
  });
  const attach = page.getByRole("button", {
    name: "Usar este enlace",
    exact: true,
  });
  for (const value of [
    "http://youtu.be/0FkRr45YeEQ",
    "https://youtube.com.evil.invalid/watch?v=0FkRr45YeEQ",
    "https://youtube.com/playlist?list=abcd",
    "https://user:secret@youtube.com/watch?v=0FkRr45YeEQ",
    "https://vimeo.com/123#fragment",
    "https://youtube.com/watch?v=0FkRr45YeEQ&v=cCMob-mi19U",
  ]) {
    await link.fill(value);
    await expect(attach).toBeDisabled();
  }
  expect(http.state.creates).toHaveLength(0);
  await link.fill("https://youtu.be/0FkRr45YeEQ");
  await attach.click();
  await expect(
    page.locator('iframe[title="Movimiento con enlace QA"]'),
  ).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/0FkRr45YeEQ",
  );
  expect(http.state.creates).toMatchObject([
    {
      source_kind: "external",
      provider: "youtube",
      external_url: "https://www.youtube.com/watch?v=0FkRr45YeEQ",
      mediaType: "Video",
    },
  ]);
  expect(http.state.publishes).toHaveLength(1);
  expect(http.state.signed).toHaveLength(0);
  await page.screenshot({
    path: info.outputPath("exercise-link-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Crear rutina", exact: true }).click();
  await expect.poll(() => http.state.saves.length).toBe(1);
  expect(http.state.saves[0].exercises?.[0].mediaId).toBe(
    http.state.publishes[0],
  );
});

test("2.20b · fallo al publicar conserva el archivo y reintenta el mismo borrador; biblioteca sustituye el enlace", async ({
  page,
}) => {
  const http = await mockExerciseDemo(page);
  http.state.publishFails = true;
  await page.goto("/wellness/exercise-routines");
  await page.getByTitle("Editar", { exact: true }).click();
  await page
    .getByLabel("Enlace único de YouTube o Vimeo", { exact: true })
    .fill("https://vimeo.com/418873416");
  await page
    .getByRole("button", { name: "Usar este enlace", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "No se pudo adjuntar el enlace",
  );
  await expect(
    page.getByRole("img", { name: "Movimiento QA", exact: true }),
  ).toBeVisible();
  http.state.publishFails = false;
  await page
    .getByRole("button", { name: "Usar este enlace", exact: true })
    .click();
  await expect(page.locator('iframe[title="Movimiento QA"]')).toHaveAttribute(
    "src",
    "https://player.vimeo.com/video/418873416?dnt=1",
  );
  expect(http.state.creates).toHaveLength(1);
  expect(http.state.publishes[0]).toBe(http.state.publishes[1]);
  await page.locator('button[id$="-library"]').click();
  const picker = page.getByRole("dialog", {
    name: "Demostración del ejercicio",
    exact: true,
  });
  await picker
    .getByRole("button", {
      name: "Seleccionar Imagen de técnica QA",
      exact: true,
    })
    .click();
  await picker.getByRole("button", { name: "Añadir 1", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('iframe[title="Movimiento QA"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect.poll(() => http.state.saves.length).toBe(1);
  expect(http.state.saves[0].exercises?.[0].mediaId).toBe(http.file.id);
});

test("2.20b · enlace existente se conserva al editar y se reproduce en detalle y móvil", async ({
  page,
}, info) => {
  const http = await mockExerciseDemo(page);
  const external = {
    ...http.file,
    id: "external-qa",
    mediaType: "Video" as const,
    storageKey: "external/youtube/0FkRr45YeEQ",
    source_kind: "external" as const,
    external_url: "https://youtu.be/0FkRr45YeEQ",
    provider: "youtube" as const,
  };
  http.store.set(external.id, external);
  http.routine.exercises[0].mediaId = external.id;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wellness/exercise-routines");
  await page.getByTitle("Editar", { exact: true }).click();
  await expect(page.locator('iframe[title="Movimiento QA"]')).toBeVisible();
  await page.screenshot({
    path: info.outputPath("exercise-link-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect.poll(() => http.state.saves.length).toBe(1);
  expect(http.state.saves[0].exercises?.[0].mediaId).toBe(external.id);
  await page.getByTitle("Ver detalles", { exact: true }).click();
  await expect(page.locator('iframe[title="Movimiento QA"]')).toBeVisible();
  expect(http.state.creates).toHaveLength(0);
  expect(http.state.signed).toHaveLength(0);
});
