import { test, expect } from "@playwright/test";
import { agentId, mockAgentsHttp } from "./agents-http";

test("editar routing valida límites, guarda metadata ajena y reabre los valores guardados", async ({ page }) => {
  const state = await mockAgentsHttp(page);
  await page.goto("/agents");
  await page.getByRole("button", { name: /Editar Especialista QA/ }).click();
  const dialog = page.getByRole("dialog", { name: "Editar agente" });
  await expect(dialog.getByLabel("Temas", { exact: true })).toHaveValue("nutrición");
  await dialog.getByLabel("Temas", { exact: true }).fill("a".repeat(81));
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog.getByRole("alert")).toContainText("máximo 32");
  await expect(dialog.getByLabel("Temas", { exact: true })).toBeFocused();
  expect(state.writes).toHaveLength(0);
  await dialog.getByLabel("Temas", { exact: true }).fill("descanso\nactividad física");
  await dialog.getByLabel("Palabras clave", { exact: true }).fill("dormir\ncaminar");
  await dialog.getByRole("checkbox", { name: "Texto", exact: true }).uncheck();
  await dialog.getByRole("checkbox", { name: "Voz", exact: true }).focus();
  await page.keyboard.press("Space");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).toHaveCount(0);
  expect(JSON.parse(state.writes[0].body.metadata as string)).toEqual({ slug: "qa", custom: { keep: true }, routing: { topics: ["descanso", "actividad física"], keywords: ["dormir", "caminar"], channels: ["voice"], future: 7 } });
  await page.getByRole("button", { name: /Editar Especialista QA/ }).click();
  await expect(dialog.getByLabel("Temas", { exact: true })).toHaveValue("descanso\nactividad física");
  await expect(dialog.getByRole("checkbox", { name: "Voz", exact: true })).toBeChecked();
  expect(state.unknowns).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("creación legada sin personalización conserva metadata null", async ({ page }) => {
  const state = await mockAgentsHttp(page);
  await page.goto("/agents/new");
  await page.getByPlaceholder("Ej. Asistente de Nutrición", { exact: true }).fill("Agente nuevo QA");
  await expect(page.getByRole("switch", { name: "Personalizar selección en Vita" })).not.toBeChecked();
  await page.getByRole("button", { name: "Crear agente", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toMatchObject({ status: "Borrador", metadata: null });
  expect(state.unknowns).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("routing en inglés a 390 px: canales por defecto explícitos y sin desbordamiento", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockAgentsHttp(page, true);
  await page.goto("/agents/new");
  await page.getByRole("switch", { name: "Customize selection in Vita" }).check();
  await expect(page.getByRole("checkbox", { name: "Text:", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Voice", exact: true })).toBeChecked();
  await expect(page.getByLabel("Topics", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(state.unknowns).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("versión: seis consultas opt-in, advanced roundtrip y RAG global/propio con documento", async ({ page }) => {
  const state = await mockAgentsHttp(page);
  await page.goto(`/agents/${agentId}/versions/new`);
  const tools = ["Mi día", "Mi nutrición", "Mis evaluaciones", "Mi podcast", "Mi ejercicio", "Mi progreso"];
  for (const name of tools) await expect(page.getByRole("button", { name, exact: false })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Ver configuración avanzada (JSON)", exact: true }).click();
  const advanced = page.locator("textarea.font-mono");
  await advanced.fill(JSON.stringify({ system_prompt: "Guía sintética", tools: ["legacy_tool"], retrieval_config: { enabled: false, threshold: 0.8 }, memory_config: { enabled: true, namespace: "keep" }, future: { preserve: true } }));
  await page.getByRole("button", { name: "Ocultar configuración avanzada", exact: true }).click();
  for (const name of tools) await page.getByRole("button", { name, exact: false }).click();
  await page.getByRole("switch", { name: "Usar conocimiento de documentos" }).check();
  await page.getByRole("button", { name: /Guía global QA/ }).click();
  await page.getByRole("button", { name: /Guía propia QA/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "guia-qa.md", mimeType: "text/markdown", buffer: Buffer.from("# Material sintético\nDocumentación QA") });
  await page.getByRole("button", { name: "Ver configuración avanzada (JSON)", exact: true }).click();
  expect(JSON.parse(await advanced.inputValue())).toMatchObject({ tools: ["legacy_tool", "get_my_day", "get_my_nutrition", "get_my_assessments", "get_my_podcast", "get_my_exercise", "get_my_progress"], retrieval_config: { enabled: true, knowledge_base_ids: ["kb-global", "kb-own"], threshold: 0.8 }, memory_config: { namespace: "keep" }, future: { preserve: true } });
  await page.getByRole("button", { name: "Ocultar configuración avanzada", exact: true }).click();
  await page.getByRole("button", { name: "Crear versión", exact: true }).click();
  await expect.poll(() => state.writes.filter((write) => write.path.endsWith("/versions")).length).toBe(1);
  const version = state.writes.find((write) => write.path.endsWith("/versions"))!;
  expect(JSON.parse(version.body.config as string)).toMatchObject({ future: { preserve: true }, retrieval_config: { enabled: true, knowledge_base_ids: ["kb-global", "kb-own"], threshold: 0.8 } });
  expect(state.writes.map((write) => write.method)).toEqual(["PUT", "POST", "POST"]);
  expect(state.writes[1].path).toBe("/api/v1/agents/knowledge-bases/kb-own/documents");
  expect(state.unknowns).toEqual([]);
  expect(state.errors).toEqual([]);
});
