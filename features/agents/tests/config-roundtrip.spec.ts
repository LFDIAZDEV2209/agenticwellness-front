import { test, expect } from "@playwright/test";
import { parseAgentRouting, toAgentRoutingMetadata, validRoutingValues } from "../services/agent-routing-utils";
import { emptyRuntimeConfig, parseRuntimeConfig, toRuntimeConfigJson, TOOL_OPTIONS } from "../services/version-config-utils";
import es from "../../../providers/translations/es.json";
import en from "../../../providers/translations/en.json";

test("metadata legada se conserva byte por byte al guardar sin editar routing", () => {
  for (const metadata of [null, '{ "slug": "nutrition", "color": "verde" }', "{", "[]", "null"]) {
    const form = parseAgentRouting(metadata);
    expect(form).toEqual({ enabled: false, topics: "", keywords: "", channels: ["text", "voice"] });
    expect(toAgentRoutingMetadata(metadata, form)).toBe(metadata);
  }
});

test("editar routing conserva metadata ajena y opciones futuras del routing", () => {
  const metadata = JSON.stringify({ slug: "nutrition", nested: { flags: [1, 2] }, routing: { topics: ["antes"], keywords: ["menú"], channels: ["text"], future: { weight: 2 } } });
  const form = { ...parseAgentRouting(metadata), topics: " nutrición \n\n actividad física ", channels: ["voice"] as const };
  const result = toAgentRoutingMetadata(metadata, { ...form, channels: [...form.channels] });
  expect(JSON.parse(result!)).toEqual({ slug: "nutrition", nested: { flags: [1, 2] }, routing: { topics: ["nutrición", "actividad física"], keywords: ["menú"], channels: ["voice"], future: { weight: 2 } } });
  expect(parseAgentRouting(result)).toMatchObject({ topics: "nutrición\nactividad física", channels: ["voice"] });
});

test("desactivar routing restaura compatibilidad sin eliminar metadata ajena", () => {
  const metadata = '{"slug":"qa","routing":{"topics":["test"],"channels":[]}}';
  const result = toAgentRoutingMetadata(metadata, { ...parseAgentRouting(metadata), enabled: false });
  expect(JSON.parse(result!)).toEqual({ slug: "qa" });
  expect(parseAgentRouting(result).channels).toEqual(["text", "voice"]);
});

test("32 valores de 80 caracteres son válidos; 33 valores u 81 caracteres se rechazan", () => {
  const limit = Array.from({ length: 32 }, (_, i) => `${i}`.padEnd(80, "a")).join("\n");
  expect(validRoutingValues(limit)).toBe(true);
  for (const topics of [limit + "\nextra", "a".repeat(81)]) {
    expect(validRoutingValues(topics)).toBe(false);
    expect(() => toAgentRoutingMetadata(null, { ...parseAgentRouting(null), enabled: true, topics })).toThrow("routing");
  }
  expect(JSON.parse(toAgentRoutingMetadata(null, { ...parseAgentRouting(null), enabled: true, topics: limit })!).routing.topics).toHaveLength(32);
});

test("canales explícitos vacíos no se convierten en permisos; metadata inválida no se sobrescribe", () => {
  const form = { ...parseAgentRouting(null), enabled: true, channels: [] };
  expect(parseAgentRouting(toAgentRoutingMetadata(null, form)).channels).toEqual([]);
  expect(() => toAgentRoutingMetadata("[]", form)).toThrow("metadata");
});

test("roundtrip conserva opciones desconocidas raíz, retrieval y memoria, y tools antiguas", () => {
  const raw = { system_prompt: "Guía", tools: ["legacy_tool", "calculate"], prompt: "Contexto", provider: "custom", model: "modelo-antiguo", temperature: 0, max_tokens: 900, retrieval_config: { enabled: true, knowledge_base_ids: ["global", "own"], top_k: 7, threshold: 0.8, filters: { locale: "es" } }, memory_config: { enabled: false, categories: ["preferencias"], namespace: "old" }, max_tool_calls: 3, recursion_limit: 9, future: { nested: ["keep"] } };
  const form = parseRuntimeConfig(JSON.stringify(raw));
  expect(JSON.parse(toRuntimeConfigJson(form))).toEqual(raw);
  const edited = JSON.parse(toRuntimeConfigJson({ ...form, systemPrompt: "Nueva guía", tools: [...form.tools, "get_my_day"], knowledgeBaseIds: ["own"], extraPrompt: null, provider: null, model: null, temperature: null, maxTokens: null }));
  expect(edited).toMatchObject({ system_prompt: "Nueva guía", tools: ["legacy_tool", "calculate", "get_my_day"], future: raw.future, retrieval_config: { ...raw.retrieval_config, knowledge_base_ids: ["own"] }, memory_config: raw.memory_config });
  for (const key of ["prompt", "provider", "model", "temperature", "max_tokens"]) expect(edited).not.toHaveProperty(key);
  expect(form.originalConfig).toEqual(raw);
});

test("opciones nuevas no se autoañaden a configuraciones antiguas, vacías ni nuevas", () => {
  for (const raw of [{}, { tools: [] }, { tools: ["custom"] }]) {
    expect(JSON.parse(toRuntimeConfigJson(parseRuntimeConfig(JSON.stringify(raw)))).tools).toEqual("tools" in raw ? raw.tools : []);
  }
  expect(emptyRuntimeConfig().tools).toEqual(["calculate", "get_current_time"]);
  expect(TOOL_OPTIONS.map((tool) => tool.value)).toEqual(["calculate", "get_current_time", "get_my_day", "get_my_nutrition", "get_my_assessments", "get_my_podcast", "get_my_exercise", "get_my_progress"]);
  for (const tool of TOOL_OPTIONS) for (const key of [tool.label, tool.description]) {
    expect(es).toHaveProperty(key);
    expect(en).toHaveProperty(key);
  }
});

test("JSON parcial o inválido no rompe el editor", () => {
  for (const raw of ["{", "null", "[]", "1"]) expect(parseRuntimeConfig(raw)).toEqual(emptyRuntimeConfig());
});
