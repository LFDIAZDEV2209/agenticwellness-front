import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mockRoutineEdit, reviewRoutineEdit } from "./fixtures/routine-edit-http";

/** Solo host QA propio contra PostgreSQL READ ONLY. Nunca arranca/reconfigura API 5122. */
const configPath = process.env.COP_222_PRIVATE_CONFIG;
if (!configPath) throw new Error("COP_222_PRIVATE_CONFIG requerido; ejecutar el host QA documentado");
const qa = JSON.parse(readFileSync(configPath, "utf8")) as { url: string; routineId: string; adminToken: string; zeroToken: string; deniedToken: string;
  expected: { patientCount: number; enrollmentCount: number; activeWeekCount: number }; backend: string; readOnly: boolean };
const path = `/api/v1/program/routines/${qa.routineId}/usage`;

test("2.22 · HTTP del controlador real valida 401/403/404, agregado N positivo y cero por alcance", async ({ request }) => {
  expect(qa.backend).toBe("9b901d710e8a575e404c2247370f5a67960867f0"); expect(qa.readOnly).toBe(true);
  const statuses = [];
  for (const [token, route, status] of [[null, path, 401], [qa.deniedToken, path, 403], [qa.adminToken, "/api/v1/program/routines/ffffffff-ffff-4fff-8fff-ffffffffffff/usage", 404]] as const) {
    const response = await request.get(qa.url + route, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    statuses.push(response.status()); expect(response.status()).toBe(status);
  }
  const positive = await request.get(qa.url + path, { headers: { Authorization: `Bearer ${qa.adminToken}` } });
  expect(positive.status()).toBe(200);
  expect(await positive.json()).toEqual({ routineId: qa.routineId, ...qa.expected });
  expect(qa.expected.patientCount).toBeGreaterThan(0);
  const zero = await request.get(qa.url + path, { headers: { Authorization: `Bearer ${qa.zeroToken}` } });
  expect(zero.status()).toBe(200); expect(await zero.json()).toEqual({ routineId: qa.routineId, patientCount: 0, enrollmentCount: 0, activeWeekCount: 0 });
  writeFileSync("qa-reports/routine-usage-final/http-real.json", JSON.stringify({ backend: qa.backend, route: path, statuses,
    positive: await positive.json(), zero: await zero.json(), readOnly: true, identity: "JWT sintético; no login Auth real" }, null, 2));
});

for (const zero of [false, true]) test(`2.22 · UI consume agregado ${zero ? "cero acotado" : "N positivo"} desde controlador/store/DB reales`, async ({ page }) => {
  const http = await mockRoutineEdit(page, { liveUsage: { routineId: qa.routineId, url: qa.url, token: zero ? qa.zeroToken : qa.adminToken } });
  const review = await reviewRoutineEdit(page);
  const count = zero ? 0 : qa.expected.patientCount;
  await expect(review.getByText(count === 1 ? "Usada en 1 paciente con semanas activas" : `Usada en ${count.toLocaleString("es-CO")} pacientes con semanas activas`, { exact: true })).toBeVisible();
  await expect(review.getByText("El conteo incluye solo pacientes de tu alcance, no el total global.")).toBeVisible();
  expect(http.usageCalls).toEqual([{ path, status: 200 }]); expect(http.calls).toHaveLength(0);
  await page.screenshot({ path: `qa-reports/routine-usage-final/real-${zero ? "zero" : "positive"}.png`, animations: "disabled" });
  await page.keyboard.press("Escape"); expect(http.calls).toHaveLength(0);
});
