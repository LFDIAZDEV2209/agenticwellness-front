import { expect, test, type Page } from "@playwright/test";
import { mockPlatformStyleHttp } from "../../../e2e/fixtures/platform-style-http";
import type { MediaInput, MediaItem } from "../types";

/** Audio PCM válido para comprobar continuidad real, además de identidad del nodo. */
function silentAudio() {
  const buffer = Buffer.alloc(44 + 480_000);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(buffer.length - 44, 40);
  return buffer;
}

async function mockEditor(page: Page, { english = false, external = false } = {}) {
  await mockPlatformStyleHttp(page, { english });
  const writes: MediaInput[] = [];
  const uploads: string[] = [];
  let failSave = false;
  let item: MediaItem = {
    id: "podcast-118", title: "Una pausa consciente", author: "Ana Pérez",
    description: "Respiración y bienestar", mediaType: external ? "Video" : "Podcast",
    category: "Mindfulness", storageKey: external ? "external/youtube/abcdefghijk" : "media/audio/pausa.wav",
    thumbnailKey: null, contentType: external ? "video/mp4" : "audio/wav",
    fileSizeBytes: 16044, durationSecs: 90, status: "Published", sortOrder: 7, day: 12, month: 3,
    publishedAt: "2026-11-13T12:00:00Z", createdAt: "2026-11-13T12:00:00Z", updatedAt: null, createdBy: null,
    chapters: [{ atSeconds: 0, label: "Introducción" }], takeaways: ["Respira"], tags: ["calma"],
    source_kind: external ? "external" : "file", external_url: external ? "https://youtu.be/abcdefghijk" : null,
    provider: external ? "youtube" : null,
  };
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/v1/media") {
      // El listado omite metadatos avanzados; guardar debe partir del detalle.
      const { chapters: _chapters, takeaways: _takeaways, ...listed } = item;
      void _chapters; void _takeaways;
      return reply({ items: [listed], totalCount: 1, page: 1, pageSize: 20, totalPages: 1 });
    }
    if (path === `/api/v1/media/${item.id}`) {
      if (request.method() === "PUT") {
        if (failSave) return reply({ detail: "Servicio temporalmente no disponible" }, 503);
        const input = request.postDataJSON() as MediaInput;
        writes.push(input);
        item = { ...item, ...input };
      }
      return reply(item);
    }
    if (path.endsWith("/references")) return reply({ mediaId: item.id, totalReferences: 0, templateReferences: [], enrollmentReferences: [] });
    if (path === "/api/v1/media/upload-intent") return reply({ storageKey: "media/thumbnails/nueva.png", presignedUrl: `${new URL(page.url()).origin}/api/v1/storage/qa-thumb` });
    if (path === "/api/v1/storage/qa-thumb") { uploads.push(request.method()); return route.fulfill({ status: 204 }); }
    if (path === "/api/v1/storage/sign") return reply({ url: "/qa-podcast.wav" });
    return route.fallback();
  });
  await page.route("**/qa-podcast.wav", route => route.fulfill({ contentType: "audio/wav", body: silentAudio() }));
  return { writes, uploads, setFailSave: (value: boolean) => { failSave = value; } };
}

async function openDrawer(page: Page, english = false) {
  await page.getByRole("button", { name: /Acciones de| actions$/ }).click();
  await page.getByRole("menuitem", { name: english ? "Edit" : "Editar", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: english ? "Edit podcast" : "Editar podcast", exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("card drawer updates title, category, tags and thumbnail without losing playback or advanced metadata", async ({ page }) => {
  const api = await mockEditor(page);
  await page.goto("/media");
  await expect(page.getByRole("list", { name: "Etiquetas", exact: true })).toContainText("calma");
  await page.getByRole("button", { name: "Escuchar Una pausa consciente" }).click();
  await expect(page.locator("audio")).toBeVisible();
  await page.locator("audio").evaluate(async element => {
    const player = element as HTMLAudioElement;
    await player.play();
  });
  await expect.poll(() => page.locator("audio").evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(1);
  const initialPosition = await page.locator("audio").evaluate(element => (element as HTMLAudioElement).currentTime);
  const audio = await page.locator("audio").elementHandle();
  const drawer = await openDrawer(page);
  await expect(drawer.getByLabel(/Día|Mes|Orden de lección|Estado/)).toHaveCount(0);
  await drawer.getByLabel("Título", { exact: false }).fill("Pausa renovada");
  await drawer.getByLabel("Categoría", { exact: false }).selectOption("Nutricion");
  await drawer.getByRole("textbox", { name: "Etiquetas", exact: true }).fill("  ENERGÍA  ");
  await drawer.getByRole("textbox", { name: "Etiquetas", exact: true }).press("Enter");
  await expect(drawer).toBeVisible();
  await drawer.locator('input[type="file"][accept^="image/"]').setInputFiles({ name: "portada.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=", "base64") });
  await drawer.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/media$/);
  await expect(page.getByRole("heading", { name: "Pausa renovada", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Etiquetas", exact: true })).toContainText("energía");
  expect(await page.locator("audio").evaluate((element, original) => element === original, audio)).toBe(true);
  const playback = await page.locator("audio").evaluate(element => {
    const player = element as HTMLAudioElement;
    return { paused: player.paused, position: player.currentTime, duration: player.duration, ended: player.ended };
  });
  expect(playback).toMatchObject({ paused: false, ended: false });
  expect(playback.position).toBeGreaterThan(initialPosition);
  expect(api.uploads).toEqual(["PUT"]);
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0]).toMatchObject({ title: "Pausa renovada", category: "Nutricion", tags: ["calma", "energía"], thumbnailKey: "media/thumbnails/nueva.png", source_kind: "file", external_url: null, storageKey: "media/audio/pausa.wav", day: 12, month: 3, sortOrder: 7, status: "Published", chapters: [{ atSeconds: 0, label: "Introducción" }], takeaways: ["Respira"] });
});

test("a failed save retains edits and pending tags; retry saves the same item", async ({ page }) => {
  const api = await mockEditor(page);
  await page.goto("/media");
  const drawer = await openDrawer(page);
  await drawer.getByLabel("Título", { exact: false }).fill("Pausa corregida");
  await drawer.getByRole("textbox", { name: "Etiquetas", exact: true }).fill("sueño");
  api.setFailSave(true);
  await drawer.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(drawer.getByRole("alert")).toBeVisible();
  await expect(drawer.getByLabel("Título", { exact: false })).toHaveValue("Pausa corregida");
  await expect(drawer.getByRole("textbox", { name: "Etiquetas", exact: true })).toHaveValue("sueño");
  expect(api.writes).toHaveLength(0);
  api.setFailSave(false);
  await drawer.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0].tags).toEqual(["calma", "sueño"]);
});

test("tag validation prevents invalid writes, normalizes duplicates and allows clearing all tags", async ({ page }) => {
  const api = await mockEditor(page);
  await page.goto("/media");
  const drawer = await openDrawer(page);
  const input = drawer.getByRole("textbox", { name: "Etiquetas", exact: true });
  await input.fill("x".repeat(65));
  await drawer.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(drawer.getByRole("alert")).toContainText("32 etiquetas");
  expect(api.writes).toHaveLength(0);
  await input.fill(" CALMA ");
  await input.press("Enter");
  await expect(drawer.getByRole("button", { name: "Quitar etiqueta calma", exact: true })).toHaveCount(1);
  await drawer.getByRole("button", { name: "Quitar etiqueta calma", exact: true }).click();
  await drawer.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  expect(api.writes[0].tags).toEqual([]);
});

test("full edit preserves the external source contract and tags without uploading content", async ({ page }) => {
  const api = await mockEditor(page, { external: true });
  await page.goto("/media/podcast-118/edit");
  await expect(page.getByRole("link", { name: "Ver video en el sitio de origen" })).toHaveAttribute("href", "https://youtu.be/abcdefghijk");
  await expect(page.getByLabel(/Día|Mes/)).toHaveCount(0);
  await page.getByRole("textbox", { name: "Etiquetas", exact: true }).fill("técnica");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page).toHaveURL(/\/media\/podcast-118$/);
  expect(api.writes[0]).toMatchObject({ source_kind: "external", external_url: "https://youtu.be/abcdefghijk", provider: "youtube", mediaType: "Video", tags: ["calma", "técnica"] });
  expect(api.uploads).toEqual([]);
});

test("English drawer reflows at mobile widths and cancelling never writes", async ({ page }) => {
  const api = await mockEditor(page, { english: true });
  await page.goto("/media");
  const drawer = await openDrawer(page, true);
  await expect(drawer.getByPlaceholder("Type a tag and press Enter")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Add tag", exact: true })).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  expect(api.writes).toEqual([]);
});
