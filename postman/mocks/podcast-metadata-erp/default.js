// Sustituto editorial de BACK 4c7a811 (4.6b). Solo datos sintéticos; no publica ni persiste.
/* global require, process */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Postman carga CommonJS.
const http = require("http");
http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  if (req.url !== "/api/v1/media/podcast-metadata" || req.method !== "POST") return send(501, { detail: "Fuera del contrato simulado 4.9" });
  const b = req.body;
  if (!b || Object.keys(b).some(k => !["title", "language", "context"].includes(k))
    || typeof b.title !== "string" || !b.title.trim() || b.title.length > 200
    || !["es", "en"].includes(b.language) || typeof b.context !== "string" || b.context.length > 16000
    || /https?:\/\/|<[^>]+>/i.test(b.title + b.context)) return send(400, { detail: "Texto editorial inválido" });
  const mode = req.headers["x-qa-case"] ?? "ok";
  const delay = Math.min(2000, Math.max(0, Number(req.headers["x-qa-delay-ms"]) || 0));
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  if (["403", "429", "500", "503"].includes(mode)) return send(Number(mode), { detail: "Fallo sintético" });
  if (mode === "unavailable") return send(200, { status: "unavailable", isEstimate: true, draft: null, model: null, generatedAt: null });
  const result = { status: "ok", isEstimate: true,
    draft: { description: b.language === "en" ? "Small steps for lasting habits. Synthetic editorial draft." : "Pequeños pasos para construir hábitos. Borrador editorial sintético.", category: "Habitos", tags: ["constancia", "hábitos"] },
    model: mode === "no-model" ? null : "qa-podcast-model", generatedAt: "2026-11-15T21:00:00Z" };
  if (mode === "invalid-category") result.draft.category = "Hábitos";
  if (mode === "invalid-tags") result.draft.tags = ["x".repeat(65)];
  if (mode === "invalid-date") result.generatedAt = "ayer";
  if (mode === "hostile") result.draft.description = '<img src=x onerror="window.qaInjected=true">';
  if (mode === "invalid-estimate") result.isEstimate = false;
  return send(200, result);
}).listen(process.env.PORT, "127.0.0.1");
