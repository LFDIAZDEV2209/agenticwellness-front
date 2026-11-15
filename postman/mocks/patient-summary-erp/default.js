// Sustituto local del contrato ERP 4.4b, BACK 3b6e09e. Solo datos sintéticos.
/* global require, process, pm */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- El runtime de mocks Postman carga CommonJS.
const http = require("http");
function draft(language) {
  const english = language === "en";
  return {
    id: "00000000-0000-4000-8000-000000000701", kind: "patient_summary", isEstimate: true,
    summary: english ? "Three meals were recorded in the period [nutrition.records]." : "Se registraron tres comidas en el período [nutrition.records].",
    sourceRefs: ["nutrition.records"],
    attention: [{ text: english ? "Review the recorded activity [exercise.completions]." : "Revisar la actividad registrada [exercise.completions].", sourceRefs: ["exercise.completions"] }],
    model: "qa-summary-model", generatedAt: "2026-11-15T16:00:00Z", language,
    startDate: "2026-11-09", endDate: "2026-11-15",
    sources: [
      { ref: "nutrition.records", section: "nutrition", from: "2026-11-09", to: "2026-11-15" },
      { ref: "exercise.completions", section: "exercise", from: "2026-11-09", to: "2026-11-15" },
    ],
  };
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://simulation.invalid");
  const match = url.pathname.match(/^\/api\/v1\/program\/erp\/patients\/([a-f0-9-]{36})\/ai-summary$/i);
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  if (!match || !["GET", "POST"].includes(req.method)) return send(501, { detail: "Fuera de la simulación 4.7" });
  const language = req.method === "GET" ? url.searchParams.get("language") ?? "es" : req.body?.language ?? "es";
  if (!["es", "en"].includes(language) || (req.method === "POST" && (!req.body || Object.keys(req.body).some(key => key !== "language"))))
    return send(400, { detail: "Idioma o cuerpo inválido" });
  const mode = req.headers["x-qa-case"] ?? "ok";
  const method = req.method;
  const stateKey = `patient-summary-erp:${match[1]}:${language}`;
  const stored = await pm.state.get(stateKey);
  let summary = stored ?? draft(language);
  const delay = Math.min(1000, Math.max(0, Number(req.headers["x-qa-delay-ms"]) || 0));
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  if (mode === "403" || mode === "404" || method === "POST" && ["post403", "post404"].includes(mode))
    return send(Number(mode.replace("post", "")), { detail: "Recurso no disponible" });
  if (mode === "500" || method === "POST" && mode === "post500") return send(500, { detail: "No disponible" });
  if (method === "GET" && ["empty", "insufficient", "unavailable"].includes(mode) && !stored)
    return send(200, { status: mode, summary: null });
  if (method === "POST" && ["post-unavailable", "post-insufficient"].includes(mode))
    return send(200, { status: mode.replace("post-", ""), summary: null });
  if (mode === "invalid-estimate") summary = { ...summary, isEstimate: false };
  if (mode === "invalid-language") summary = { ...summary, language: language === "es" ? "en" : "es" };
  if (mode === "invalid-source") summary = { ...summary, sources: [{ ...summary.sources[0], section: "https://untrusted.invalid" }] };
  // Prueba defensiva del render, deliberadamente fuera de los textos admitidos por BACK.
  if (mode === "hostile-text") summary = { ...summary, summary: '<img src=x onerror="window.qaInjected=true"> https://untrusted.invalid [nutrition.records]' };
  if (mode === "no-model") summary = { ...summary, model: null };
  if (method === "POST") {
    summary = { ...summary, generatedAt: "2026-11-15T17:00:00Z" };
    await pm.state.set(stateKey, summary);
  }
  return send(200, { status: "ok", summary });
}).listen(process.env.PORT, "127.0.0.1");
