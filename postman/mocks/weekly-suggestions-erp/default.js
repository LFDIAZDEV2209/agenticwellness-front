// Contrato ERP 4.5b de BACK 4c7a811. Datos sintéticos, sin acceso al stack real.
/* global require, process, pm */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Postman carga CommonJS.
const http = require("http");
const draftId = (language) => language === "en" ? "00000000-0000-4000-8000-000000000802" : "00000000-0000-4000-8000-000000000801";
const actor = "00000000-0000-4000-8000-000000000100";
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://simulation.invalid");
  const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  const prefix = "weekly-suggestions-erp:";
  // Control local del runner: solo siembra estado sintético en esta sesión Postman.
  if (url.pathname === "/__qa/weekly" && req.headers["x-qa-local"] === "synthetic") {
    if (req.method === "POST" && req.body?.week?.days?.length && req.body.enrollmentId) {
      await pm.state.set(prefix + "week", req.body.week); await pm.state.set(prefix + "enrollment", req.body.enrollmentId);
      await pm.state.set(prefix + "applications", []); return send(200, { seeded: true });
    }
    if (req.method === "GET") return send(200, { week: await pm.state.get(prefix + "week"), applications: await pm.state.get(prefix + "applications") ?? [] });
  }
  const match = url.pathname.match(/^\/api\/v1\/program\/erp\/enrollments\/([a-f0-9-]{36})\/weeks\/(\d+)\/ai-suggestions(?:\/([a-f0-9-]{36})\/suggestions\/(\d+)\/apply)?$/i);
  if (!match || !["GET", "POST"].includes(req.method)) return send(501, { detail: "Fuera del contrato simulado 4.8" });
  const week = await pm.state.get(prefix + "week");
  if (!week || match[1] !== await pm.state.get(prefix + "enrollment") || Number(match[2]) !== week.weekNumber) return send(404, { detail: "Recurso no encontrado" });
  const applying = !!match[3];
  const language = applying ? match[3] === draftId("en") ? "en" : "es" : req.method === "GET" ? url.searchParams.get("language") ?? "es" : req.body?.language ?? "es";
  const mode = req.headers["x-qa-case"] ?? "ok";
  if (["403", "404", "500"].includes(mode)) return send(Number(mode), { detail: "No disponible" });
  const delay = Math.min(1000, Math.max(0, Number(req.headers["x-qa-delay-ms"]) || 0));
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  if (!["es", "en"].includes(language)) return send(400, { detail: "Idioma inválido" });
  const stateKey = prefix + "draft:" + language;
  let draft = await pm.state.get(stateKey);
  if (!draft) {
    const english = language === "en";
    draft = { id: draftId(language), kind: "weekly_plan_suggestions", isEstimate: true, state: "draft", model: "qa-weekly-model", generatedAt: "2026-11-15T16:00:00Z", language,
      startDate: week.weekStartDateLocal, endDate: week.weekEndDateLocal, planVersion: "qa-version-0", stale: mode === "stale",
      sources: [{ ref: "nutrition.records", section: "nutrition", from: "2026-11-09", to: "2026-11-15" }],
      suggestions: [0, 1].map(index => ({ index, date: week.days[index].localDate, slotKind: index ? "podcast" : "routine", kind: index ? "podcast" : "routine",
        resourceId: index ? "00000000-0000-4000-8000-000000000903" : "00000000-0000-4000-8000-000000000902",
        label: index ? english ? "New podcast QA" : "Podcast nuevo QA" : "Rutina B QA",
        reason: english ? "Alternative for professional review [nutrition.records]." : "Alternativa para revisión profesional [nutrition.records].", sourceRefs: ["nutrition.records"], state: "draft", appliedAt: null, appliedBy: null })) };
  }
  if (applying) {
    if (req.method !== "POST") return send(501, {});
    if (req.body?.confirmed !== true) return send(422, { detail: "HUMAN_CONFIRMATION_REQUIRED" });
    if (Object.keys(req.body).some(key => key !== "confirmed")) return send(400, { detail: "El cliente no elige el recurso" });
    if (match[3] !== draft.id) return send(404, {});
    const index = Number(match[4]);
    if (index < 0 || index > 4) return send(400, {});
    const suggestion = draft.suggestions[index];
    if (!suggestion) return send(404, {});
    if (/^apply(403|404|409|422|500)$/.test(mode)) return send(Number(mode.slice(5)), { detail: "Fallo sintético sin detalles internos" });
    const applications = await pm.state.get(prefix + "applications") ?? [];
    if (suggestion.state !== "applied") {
      const day = week.days.find(day => day.localDate === suggestion.date);
      const task = day.tasks.find(task => task.taskCode === (suggestion.slotKind === "routine" ? "ejercicio" : "podcast"));
      task.contentRefId = suggestion.resourceId; task.contentName = suggestion.label; task.source = "individual";
      suggestion.state = "applied"; suggestion.appliedAt = "2026-11-15T17:05:00Z"; suggestion.appliedBy = actor;
      draft.state = draft.suggestions.every(s => s.state === "applied") ? "applied" : "draft";
      applications.push({ briefId: draft.id, index, confirmed: true });
      await pm.state.set(prefix + "applications", applications); await pm.state.set(prefix + "week", week); await pm.state.set(stateKey, draft);
      if (mode === "commit500") return send(500, { detail: "Respuesta perdida tras escritura" });
      return send(200, { status: "applied", briefId: draft.id, index, week });
    }
    return send(200, { status: "already_applied", briefId: draft.id, index, week });
  }
  if (req.method === "GET" && ["empty", "insufficient", "unavailable"].includes(mode) && !await pm.state.get(stateKey)) return send(200, { status: mode, draft: null });
  if (req.method === "POST") {
    if (Object.keys(req.body ?? {}).some(key => key !== "language")) return send(400, {});
    if (["post-unavailable", "post-insufficient"].includes(mode)) return send(200, { status: mode.slice(5), draft: null });
    draft.generatedAt = "2026-11-15T17:00:00Z"; await pm.state.set(stateKey, draft);
  }
  if (mode === "invalid") draft.isEstimate = false;
  if (mode === "hostile") { draft.suggestions[0].label = '<img src=x onerror="window.qaInjected=true">'; draft.suggestions[0].reason = "https://untrusted.invalid [nutrition.records]"; }
  if (mode === "rest") { draft.suggestions[0].kind = "rest"; draft.suggestions[0].resourceId = null; }
  if (mode === "no-model") draft.model = null;
  return send(200, { status: "ok", draft });
}).listen(process.env.PORT, "127.0.0.1");
