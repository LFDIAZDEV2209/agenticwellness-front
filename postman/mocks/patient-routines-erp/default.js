// Contrato BACK e0a9c29, DAILY-ROUTINES.md §2.16. Solo datos sintéticos.
/* global require, process */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Postman carga CommonJS.
const http = require("http");
http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method !== "POST" || req.url !== "/api/v1/program/content/bulk-assign-patient-routines") return send(501, { detail: "Fuera del contrato 2.16" });
  const b = req.body;
  if (!b || Object.keys(b).sort().join(",") !== "patientIds,routineId,semanaDesde,semanaHasta" || !Array.isArray(b.patientIds) || b.patientIds.length < 1 || b.patientIds.length > 100
    || !b.routineId || !Number.isInteger(b.semanaDesde) || !Number.isInteger(b.semanaHasta) || b.semanaDesde < 1 || b.semanaHasta < b.semanaDesde || b.semanaHasta > 83) return send(400, { detail: "Contrato inválido" });
  const mode = req.headers["x-qa-case"] ?? "ok";
  if (req.headers["x-qa-delay-ms"]) await new Promise(resolve => setTimeout(resolve, Number(req.headers["x-qa-delay-ms"])));
  const failures = { inactive: [422, "ROUTINE_NOT_ACTIVE"], enrollment: [422, "ACTIVE_ENROLLMENT_REQUIRED"], range: [422, "PROGRAM_WEEK_OUT_OF_RANGE"], conflict: [409, "CONCURRENT_CHANGE"], forbidden: [403, "Forbidden"], server: [503, "Unavailable"] };
  if (failures[mode]) return send(failures[mode][0], { detail: failures[mode][1] });
  if (mode === "invalid") return send(200, { aplicadas: "2", omitidasSemanaIniciada: -1, omitidasSinAlcance: [] });
  if (mode === "all-started") return send(200, { aplicadas: 0, omitidasSemanaIniciada: b.patientIds.length, omitidasSinAlcance: [] });
  return send(200, { aplicadas: 1, omitidasSemanaIniciada: 1, omitidasSinAlcance: mode === "foreign-extra" ? [b.patientIds[1], "NO-ENVIADO", b.patientIds[1]] : b.patientIds.slice(1, 2) });
}).listen(process.env.PORT, "127.0.0.1");
