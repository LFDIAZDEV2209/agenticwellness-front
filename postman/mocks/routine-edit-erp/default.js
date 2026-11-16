// PUT existente y GET de uso BACK 9b901d7. Solo datos sintéticos.
/* global require, process */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Postman carga CommonJS.
const http = require("http");
http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "GET" && /^\/api\/v1\/program\/routines\/[0-9a-f-]+\/usage$/.test(req.url)) {
    if (req.headers["x-qa-usage-delay"]) await new Promise(resolve => setTimeout(resolve, Number(req.headers["x-qa-usage-delay"])));
    if (req.headers["x-qa-usage-status"]) return send(Number(req.headers["x-qa-usage-status"]), { detail: "Uso no disponible en QA" });
    const count = JSON.parse(req.headers["x-qa-usage"] ?? '{"value":0}').value;
    return send(200, { routineId: req.url.split("/").at(-2), patientCount: count, enrollmentCount: count, activeWeekCount: count });
  }
  if (req.method !== "PUT" || !/^\/api\/v1\/wellness\/exercise-routines\/[0-9a-f-]+$/.test(req.url)) return send(501, { detail: "Fuera del contrato de edición" });
  const b = req.body;
  const keys = ["name", "description", "contraindications", "difficulty", "estimatedMinutes", "category", "status", "targetMuscles", "equipment", "warmupNotes", "cooldownNotes", "mediaId", "exercises"].sort().join(",");
  if (!b || Object.keys(b).sort().join(",") !== keys || !b.name?.trim()) return send(400, { detail: "Contrato inválido" });
  if (req.headers["x-qa-delay-ms"]) await new Promise(resolve => setTimeout(resolve, Number(req.headers["x-qa-delay-ms"])));
  const mode = req.headers["x-qa-case"] ?? "ok";
  if (["403", "409", "503"].includes(mode)) return send(Number(mode), { detail: "Fallo sintético controlado" });
  return send(200, { ...b, id: req.url.split("/").at(-1), createdBy: null, createdAt: "2026-11-15T12:00:00Z", updatedAt: "2026-11-15T13:00:00Z" });
}).listen(process.env.PORT, "127.0.0.1");
