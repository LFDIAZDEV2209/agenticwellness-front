import { expect, type Page } from "@playwright/test";
import { mockPlatformStyleHttp } from "./platform-style-http";

/** La ayuda usa HTTP Postman real; autenticación y catálogo son fixtures locales sin escrituras externas. */
export async function setupPodcastMetadata(page: Page, options: { english?: boolean; missing?: string; mode?: string; delay?: number } = {}) {
  await mockPlatformStyleHttp(page, { english: options.english });
  const calls: { body: unknown; status?: number }[] = [];
  const writes: { path: string; body: unknown }[] = [];
  const errors: string[] = [];
  let mode = options.mode ?? "ok";
  let failSave = false;
  page.on("pageerror", error => errors.push(error.message));
  if (options.missing) await page.route("**/api/auth/me", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    id: "podcast-qa", email: "podcast@example.invalid", firstName: "Ana", lastName: "Pruebas", roles: ["Admin"],
    permissions: ["Media.View", "Media.Create", "Program.AiManage"].filter(code => code !== options.missing),
  }) }));
  await page.route("**/api/v1/media/podcast-metadata", async route => {
    const body = route.request().postDataJSON();
    const call: typeof calls[number] = { body }; calls.push(call);
    const response = await page.request.post((process.env.E2E_PODCAST_SIM_URL ?? "http://127.0.0.1:4541") + "/api/v1/media/podcast-metadata", {
      headers: { "x-mock-slug": "podcast-erp", "x-qa-case": mode, "x-qa-delay-ms": String(options.delay ?? 0) }, data: body,
    });
    call.status = response.status();
    await route.fulfill({ response });
  });
  await page.route("**/api/v1/media/upload-intent", async route => {
    writes.push({ path: "upload-intent", body: route.request().postDataJSON() });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ storageKey: "media/podcasts/qa49.mp3", presignedUrl: new URL("/api/v1/storage/qa49", page.url()).href, expiresInSeconds: 300 }) });
  });
  await page.route("**/api/v1/storage/qa49", async route => { writes.push({ path: "storage", body: null }); await route.fulfill({ status: 204 }); });
  await page.route("**/api/v1/media", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    writes.push({ path: "create", body });
    await route.fulfill({ status: failSave ? 503 : 200, contentType: "application/json", body: JSON.stringify(failSave ? { detail: "Error sintético de guardado" } : { id: "qa49", ...body }) });
  });
  await page.goto("/media/new");
  const panel = page.getByTestId("podcast-metadata-assistant");
  await expect(page.getByRole("button", { name: options.english ? "Create media" : "Crear medio", exact: true })).toBeVisible();
  return { panel, calls, writes, errors, setMode: (value: string) => { mode = value; }, setFailSave: (value: boolean) => { failSave = value; } };
}

export function podcastAudio() {
  const buffer = Buffer.alloc(44 + 16000);
  buffer.write("RIFF"); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(16000, 40);
  return { name: "episodio.mp3", mimeType: "audio/mpeg", buffer };
}
