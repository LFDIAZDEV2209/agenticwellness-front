import { test, expect, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// UI, Auth y PostgreSQL reales. Solo se permite la base sintética aislada.
const fixturePath = process.env.COP_MEDICATION_FIXTURE ?? "/tmp/copp-medication-e2e/fixture.private.json";
const erp = process.env.COP_MEDICATION_ERP_URL ?? "http://127.0.0.1:3160";
const app = process.env.COP_MEDICATION_APP_URL ?? "http://127.0.0.1:5189";
for (const origin of [erp, app]) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") throw new Error("Only loopback QA hosts are allowed");
}
function fixture() {
  if (!fixturePath.startsWith("/tmp/")) throw new Error("Private fixture required");
  const f = JSON.parse(readFileSync(fixturePath, "utf8"));
  if (!/^copp_review_medications_[a-z0-9_]+$/.test(f.database) || f.gateway !== "http://127.0.0.1:5160"
      || f.patientId !== "00000000-0000-4000-8000-000000000101") throw new Error("Isolated medication fixture required");
  return f;
}
function sql(command: string) {
  const f = fixture();
  return execFileSync("docker", ["exec", "copp-medications-e2e", "psql", "-U", "app_user", "-d", f.database, "-At", "-v", "ON_ERROR_STOP=1", "-c", command], { encoding: "utf8" }).trim();
}
async function login(context: BrowserContext, role: "patient" | "manager" | "reader") {
  const f = fixture();
  const account = f.accounts[role];
  const response = await context.request.post(f.gateway + "/api/auth/login", {
    data: { email: account.login, password: account.password, application: role === "patient" ? "app" : "erp" },
  });
  expect(response.status(), "Real Auth login").toBe(200);
  return { Authorization: "Bearer " + (await response.json()).accessToken };
}
const self = "/api/v1/me/medications";
const caps = "/api/v1/me/capabilities";
const snapshot = "/api/v1/program/me/snapshot";
const overview = "/api/v1/medications/overview";
const directory = "/api/v1/medications/patients";
test.beforeEach(() => {
  const f = fixture();
  sql(`DELETE FROM app.patient_module_access WHERE patient_id='${f.patientId}' AND module_code='medications'; UPDATE app.patient_profiles SET status='Activo', deleted_at=NULL WHERE id='${f.patientId}';`);
});
test.afterEach(() => {
  const f = fixture();
  sql(`DELETE FROM app.patient_module_access WHERE patient_id='${f.patientId}' AND module_code='medications'; UPDATE app.patient_profiles SET status='Activo', deleted_at=NULL WHERE id='${f.patientId}';`);
});

test("acceso predeterminado: app vacía, ERP y programa coinciden sin activar ni escribir", async ({ browser }, info) => {
  const f = fixture();
  const patient = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const manager = await browser.newContext();
  try {
    const p = await login(patient, "patient"), m = await login(manager, "manager");
    const page = await patient.newPage();
    await page.goto(app);
    await page.locator(".hm-modules").getByRole("button", { name: /Control de medicamentos/ }).click();
    await expect(page.locator(".medications-topline")).toBeVisible();
    await expect(page.getByRole("button", { name: "Añadir medicamento", exact: true }).first()).toBeVisible();
    expect((await (await patient.request.get(f.gateway + caps, { headers: p })).json()).modules.medications.enabled).toBe(true);
    const workspace = await patient.request.get(f.gateway + self, { headers: p });
    expect(workspace.status()).toBe(200);
    const data = await workspace.json();
    expect(data.access).toEqual({ enabled: true, revision: 0 });
    if (data.treatments.length === 0) await expect(page.getByText("Sin tomas programadas para hoy", { exact: true })).toBeVisible();
    const program = await patient.request.get(f.gateway + snapshot, { headers: p });
    expect(program.status()).toBe(200);
    expect((await program.json()).optionalTaskCodes).toEqual(["nutraceutico"]);
    const list = await (await manager.request.get(f.gateway + directory, { headers: m })).json();
    expect(list.items.find((x: { patientId: string }) => x.patientId === f.patientId).enabled).toBe(true);
    const stats = await (await manager.request.get(f.gateway + overview, { headers: m })).json();
    expect(stats.enabledPatients).toBe(stats.totalPatients);
    const staff = await manager.newPage();
    await staff.goto(erp + "/medications/" + f.patientId);
    await expect(staff.getByRole("button", { name: "Desactivar acceso", exact: true })).toBeVisible();
    expect(sql(`SELECT count(*) FROM app.patient_module_access WHERE patient_id='${f.patientId}' AND module_code='medications'`)).toBe("0");
    await page.screenshot({ path: info.outputPath("default-access-app.png") });
    await staff.screenshot({ path: info.outputPath("default-access-erp.png") });
  } finally { await patient.close(); await manager.close(); }
});

test("restricción explícita se conserva, requiere permiso y puede restaurarse desde ERP", async ({ browser }) => {
  const f = fixture();
  const manager = await browser.newContext(), patient = await browser.newContext(), reader = await browser.newContext();
  try {
    const m = await login(manager, "manager"), p = await login(patient, "patient"), r = await login(reader, "reader");
    const base = f.gateway + directory + "/" + f.patientId;
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
    const created = await patient.request.post(f.gateway + self + "/treatments", {
      headers: p, data: { clientRequestId: randomUUID(), name: "Acceso predeterminado QA " + randomUUID().slice(0, 8),
        productType: "medication", dosage: 1, unit: "unidad", times: ["00:00"], timeZone: "America/Bogota", startDate: date },
    });
    expect(created.status(), "Patient may create without an activation record").toBe(201);
    const treatment = await created.json();
    const workspace = await (await patient.request.get(f.gateway + self, { headers: p })).json();
    const dose = workspace.doses.find((d: { treatmentId: string }) => d.treatmentId === treatment.id);
    expect((await patient.request.post(f.gateway + self + "/doses/" + dose.id + "/events", {
      headers: p, data: { clientRequestId: randomUUID(), status: "taken", expectedRevision: 0, scheduledAt: dose.scheduledAt },
    })).status()).toBe(200);
    expect(sql(`SELECT count(*) FROM app.patient_module_access WHERE patient_id='${f.patientId}' AND module_code='medications'`)).toBe("0");
    expect((await reader.request.put(base + "/access", { headers: r, data: { enabled: false, expectedRevision: 0 } })).status()).toBe(403);
    const staff = await manager.newPage();
    await staff.goto(erp + "/medications/" + f.patientId);
    await staff.getByRole("button", { name: "Desactivar acceso", exact: true }).click();
    await expect(staff.getByRole("button", { name: "Activar acceso", exact: true })).toBeVisible();
    expect((await (await patient.request.get(f.gateway + caps, { headers: p })).json()).modules.medications.enabled).toBe(false);
    expect((await patient.request.get(f.gateway + self, { headers: p })).status()).toBe(403);
    expect((await (await patient.request.get(f.gateway + snapshot, { headers: p })).json()).optionalTaskCodes ?? null).toBeNull();
    const page = await patient.newPage();
    await page.goto(app);
    await page.locator(".hm-modules").getByRole("button", { name: /Control de medicamentos/ }).click();
    await expect(page.getByRole("heading", { name: "Control de medicamentos no disponible", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Añadir medicamento", exact: true })).toHaveCount(0);
    const list = await (await manager.request.get(f.gateway + directory, { headers: m })).json();
    expect(list.items.find((x: { patientId: string }) => x.patientId === f.patientId).enabled).toBe(false);
    const stats = await (await manager.request.get(f.gateway + overview, { headers: m })).json();
    expect(stats.enabledPatients).toBe(stats.totalPatients - 1);
    expect((await manager.request.get(base, { headers: m })).status()).toBe(200);
    const restrictedWorkspace = await (await manager.request.get(base, { headers: m })).json();
    expect(restrictedWorkspace.treatments.find((t: { id: string }) => t.id === treatment.id).status).toBe("active");
    expect(restrictedWorkspace.history.some((e: { treatmentId: string; status: string }) => e.treatmentId === treatment.id && e.status === "taken")).toBe(true);
    expect(sql(`SELECT enabled FROM app.patient_module_access WHERE patient_id='${f.patientId}' AND module_code='medications'`)).toBe("f");
    await staff.reload();
    await expect(staff.getByRole("button", { name: "Activar acceso", exact: true })).toBeVisible();
    await staff.getByRole("button", { name: "Activar acceso", exact: true }).click();
    await expect(staff.getByRole("button", { name: "Desactivar acceso", exact: true })).toBeVisible();
    expect((await patient.request.get(f.gateway + self, { headers: p })).status()).toBe(200);
    const restored = await (await patient.request.get(f.gateway + self, { headers: p })).json();
    expect(restored.history.some((e: { treatmentId: string; status: string }) => e.treatmentId === treatment.id && e.status === "taken")).toBe(true);
    expect((await (await patient.request.get(f.gateway + snapshot, { headers: p })).json()).optionalTaskCodes).toEqual(["nutraceutico"]);
  } finally { await manager.close(); await patient.close(); await reader.close(); }
});

test("paciente inactivo sigue sin acceso y no cuenta como habilitado", async ({ browser }) => {
  const f = fixture();
  const patient = await browser.newContext(), manager = await browser.newContext();
  try {
    const p = await login(patient, "patient"), m = await login(manager, "manager");
    sql(`UPDATE app.patient_profiles SET status='Inactivo' WHERE id='${f.patientId}'`);
    const page = await patient.newPage();
    await page.goto(app);
    // Auth ya bloquea la restauración de sesión de perfiles inactivos.
    await expect(page.locator("#login-id input")).toBeVisible();
    expect((await (await patient.request.get(f.gateway + caps, { headers: p })).json()).modules.medications.enabled).toBe(false);
    expect((await patient.request.get(f.gateway + self, { headers: p })).status()).toBe(403);
    expect((await (await patient.request.get(f.gateway + snapshot, { headers: p })).json()).optionalTaskCodes ?? null).toBeNull();
    const list = await (await manager.request.get(f.gateway + directory, { headers: m })).json();
    expect(list.items.find((x: { patientId: string }) => x.patientId === f.patientId).enabled).toBe(false);
    const staff = await (await manager.request.get(f.gateway + directory + "/" + f.patientId, { headers: m })).json();
    expect(staff.access.enabled).toBe(false);
    const stats = await (await manager.request.get(f.gateway + overview, { headers: m })).json();
    expect(stats.enabledPatients).toBe(stats.totalPatients - 1);
  } finally { await patient.close(); await manager.close(); }
});
