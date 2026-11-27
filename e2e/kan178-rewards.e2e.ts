import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { renameSync, writeFileSync } from "node:fs";

const zone = "America/Bogota";
const ruleCode = "TASK_EJERCICIO";
const previousXp = 17;
const nextXp = 37;
const program = "/api/v1/program";

function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Falta ${key} del fixture sintético KAN-178.`);
  return value;
}

async function body<T>(response: APIResponse, operation: string): Promise<T> {
  expect(response.status(), operation).toBe(200);
  return response.json();
}

function dates(now: Date) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: zone }).format(now);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return { today, yesterday: yesterday.toISOString().slice(0, 10) };
}

async function editRule(page: Page, value: number, code = ruleCode) {
  await page.goto("/program/adherencia?view=reglas-xp");
  await expect(page.getByRole("heading", { name: "Reglas de XP", exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) });
  const next = page.getByRole("button", { name: "Siguiente", exact: true });
  await expect(next).toBeVisible();
  while (await row.count() === 0 && await next.isEnabled()) await next.click();
  await expect(row).toBeVisible();
  await row.getByTitle("Editar", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editar regla XP" });
  await dialog.getByPlaceholder("Null = puntos de plantilla", { exact: true }).fill(String(value));
  const [response] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === `${program}/xp-rules/${code}` && r.request().method() === "PUT"),
    dialog.getByRole("button", { name: "Guardar", exact: true }).click(),
  ]);
  expect(response.status(), "ERP guardó la regla en la API real").toBe(200);
  expect(response.request().postDataJSON()).toMatchObject({ baseXp: value });
  await expect(dialog).toBeHidden();
}

type Award = { pointsAwarded: number; taskCompletionId: string };
type LedgerRow = { id: string; sourceRefId: string; amount: number; ruleCode: string };
type AuditRow = { id: string; recordId: string; action: string; actorType: string; actorEmail: string | null };

test("KAN-178 · editar XP en ERP no cambia el premio del día local en curso ni reescribe el historial", async ({ page, request }) => {
  const erpEmail = "erp-kan178@example.test";
  const url = "/api/auth/login";
  const erp = await body<{ accessToken: string }>(await page.request.post(url, { data: {
    email: erpEmail, password: required("KAN178_ERP_PASSWORD"), application: "erp", rememberMe: false,
  } }), "Auth ERP sintético");
  const patient = await body<{ accessToken: string }>(await request.post(url, { data: {
    email: "patient-kan178@example.test", password: required("KAN178_PATIENT_PASSWORD"), application: "app", rememberMe: false,
  } }), "Auth paciente sintético");
  const admin = { Authorization: `Bearer ${erp.accessToken}` };
  const headers = { Authorization: `Bearer ${patient.accessToken}` };
  expect((await request.get("/api/v1/people/me/protocol-rewards", { headers: admin })).status()).toBe(403);

  const rules = await body<{ id: string; code: string; baseXp: number }[]>(
    await request.get(`${program}/xp-rules`, { headers: admin }), "Catálogo XP inicial");
  const rule = rules.find(r => r.code === ruleCode);
  expect(rule, "fixture desechable con la regla inicial sintética").toMatchObject({ baseXp: previousXp });

  const { today, yesterday } = dates(new Date());
  const enrollment = await body<{ id: string }>(await request.post(`${program}/enrollments/me`, { headers, data: {
    templateId: required("KAN178_TEMPLATE_ID"), timezone: zone, startLocalDate: yesterday,
  } }), "Inscripción sintética en la plantilla KAN-178");
  const complete = async (localDate: string) => body<Award>(await request.post(`${program}/tasks/complete`, { headers, data: {
    enrollmentId: enrollment.id, localDate, taskCode: "ejercicio", clientRequestId: `kan178-${localDate}`,
  } }), `Completar ejercicio ${localDate}`);
  const exerciseLedger = async (completionId: string) => {
    const { data } = await body<{ data: LedgerRow[] }>(await request.get(
      `${program}/enrollments/${enrollment.id}/xp-ledger`, { headers: admin }), "Libro mayor XP");
    return data.filter(row => row.sourceRefId === completionId && row.ruleCode === ruleCode);
  };
  const ruleAudits = async () => {
    const { data } = await body<{ data: AuditRow[] }>(await request.get(`${program}/activity-log`, {
      headers: admin, params: { table: "xp_rules", action: "UPDATE" },
    }), "Bitácora de cambios de reglas XP");
    return data.filter(row => row.recordId === rule?.id && row.action === "UPDATE");
  };

  const historical = await complete(yesterday);
  expect(historical.pointsAwarded, "XP histórico antes de editar").toBe(previousXp);
  const historyBefore = await exerciseLedger(historical.taskCompletionId);
  expect(historyBefore).toHaveLength(1);
  expect(historyBefore[0].amount).toBe(previousXp);
  const auditIdsBefore = new Set((await ruleAudits()).map(row => row.id));

  await editRule(page, nextXp);
  await test.step("Conservar íntegra la entrada histórica y registrar al editor", async () => {
    const replay = await complete(yesterday);
    expect(replay.taskCompletionId).toBe(historical.taskCompletionId);
    expect(replay.pointsAwarded).toBe(historical.pointsAwarded);
    expect(await exerciseLedger(historical.taskCompletionId)).toEqual(historyBefore);
    const newRows = (await ruleAudits()).filter(row => !auditIdsBefore.has(row.id));
    expect.soft(newRows, "la auditoría debe identificar al editor ERP autenticado").toEqual(
      expect.arrayContaining([expect.objectContaining({ actorType: "USER", actorEmail: erpEmail })]),
    );
  });

  await test.step("Otorgar el valor anterior a una finalización nueva del mismo día", async () => {
    expect(dates(new Date()).today, "la ejecución completa debe quedar antes de la medianoche local").toBe(today);
    const sameDay = await complete(today);
    expect(sameDay.taskCompletionId).not.toBe(historical.taskCompletionId);
    const ledger = await exerciseLedger(sameDay.taskCompletionId);
    expect(ledger).toHaveLength(1);
    expect.soft(sameDay.pointsAwarded, "el valor nuevo no entra en vigor hasta el siguiente día local").toBe(previousXp);
    expect(ledger[0].amount, "el libro mayor también debe conservar el valor anterior para el día en curso").toBe(previousXp);
  });
});

test("KAN-178 · cinco pasos, cofre único y bonus solo al cierre", async ({ page, request }) => {
  const mobile = new URL(process.env.KAN178_MOBILE_URL ?? "http://127.0.0.1:5188");
  if (mobile.protocol !== "http:" || mobile.hostname !== "127.0.0.1" || mobile.href !== `${mobile.origin}/`)
    throw new Error("KAN-178 requiere una app HTTP local.");
  const patient = await body<{ accessToken: string }>(await page.request.post(`${mobile.origin}/api/auth/login`, { data: {
    email: "patient-kan178@example.test", password: required("KAN178_PATIENT_PASSWORD"), application: "app", rememberMe: false,
  } }), "Auth paciente sintético");
  const headers = { Authorization: `Bearer ${patient.accessToken}` };
  const rewards = "/api/v1/people/me/protocol-rewards";
  type Day = { localDate: string; steps: Record<string, number>; bonus: number; closed: boolean };
  type Snapshot = { today: Day; balance: number; level: number; levelName: string; streak: number; legacyBalance: number;
    receipt?: { created: boolean; amount: number } | null };
  const get = async () => body<Snapshot>(await request.get(rewards, { headers }), "Estado servidor del protocolo");
  const initial = await get();
  expect(initial.today.steps).toEqual({});
  expect(initial).toMatchObject({ legacyBalance: 12000, balance: 12000, level: 7, levelName: "Líder" });
  const history = async () => body<{ id: string; amount: number; balanceAfter: number }[]>(await request.get(`${rewards}/legacy-history`, { headers }), "Historial del paciente");
  const legacy = await history();
  expect(legacy).toEqual(expect.arrayContaining([expect.objectContaining({ id: "17800000-0000-4000-8000-000000000003", amount: 12000, balanceAfter: 12000 })]));
  const submit = (step: string) => request.post(`${rewards}/steps`, { headers, data: { step, localDate: initial.today.localDate } });
  expect((await submit("chest")).status(), "cofre sin los cuatro pasos").toBe(409);
  expect((await submit("podcast")).status(), "actividad retirada").toBe(422);
  expect(await get()).toEqual(initial);
  let old = await request.get(`${program}/me/snapshot`, { headers });
  if (old.status() === 404) {
    await body(await request.post(`${program}/enrollments/me`, { headers, data: {
      templateId: required("KAN178_TEMPLATE_ID"), timezone: zone, startLocalDate: initial.today.localDate,
    } }), "Inscripción legada para verificar el corte");
    old = await request.get(`${program}/me/snapshot`, { headers });
  }
  const { enrollmentId } = await body<{ enrollmentId: string }>(old, "Inscripción legada activa");
  await page.addInitScript(() => localStorage.setItem("antares_lang", "es"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(mobile.origin);
  await page.getByRole("button", { name: "Ver mi plan de bienestar" }).click();
  await page.getByRole("button", { name: "Continuar mi plan" }).click();
  await expect(page.getByRole("heading", { name: "Tu día de bienestar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cofre bloqueado" })).toBeDisabled();
  await expect(page.getByText(/Falta completar:/)).toBeVisible();

  const responseTo = (suffix: string) => page.waitForResponse(r => new URL(r.url()).pathname === rewards + suffix && r.request().method() === "POST");
  for (const [step, name, action] of [
    ["exercise", "1. Ejercicio", "Hice la versión reducida"],
    ["diet", "2. Dieta", "Marcar como hecho"],
    ["vitals", "3. Vitales", "Marcar como hecho"],
    ["emotional", "4. Emocional", "Bien"],
  ]) {
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });
    const [response] = await Promise.all([responseTo("/steps"), card.getByRole("button", { name: action, exact: true }).click()]);
    expect(response.status(), `Otorgamiento de ${step}`).toBe(200);
    const result: Snapshot = await response.json();
    expect(result.today.steps[step]).toBeGreaterThan(0);
    await expect(card.getByText("Hecho", { exact: true })).toBeVisible();
  }
  const open = page.getByRole("button", { name: "Abrir mi cofre" });
  const [receipt] = await Promise.all([responseTo("/steps"), open.click()]);
  expect(receipt.status(), "Apertura desde la app").toBe(200);
  const opened: Snapshot = await receipt.json();
  expect(opened.receipt).toMatchObject({ created: true });
  expect(await body<Snapshot>(await submit("chest"), "Reintento del cofre")).toEqual({ ...opened, receipt: { ...opened.receipt, created: false } });
  expect(Object.keys(opened.today.steps).sort()).toEqual(["chest", "diet", "emotional", "exercise", "vitals"]);
  expect(opened.balance - initial.balance).toBe(Object.values(opened.today.steps).reduce((sum, xp) => sum + xp, 0));
  expect(opened.today.bonus).toBe(0);
  expect(opened.streak).toBe(initial.streak + 1);

  await page.getByRole("button", { name: "Seguir", exact: true }).click();
  await expect(page.getByText("El bonus de secuencia se suma al cerrar el día.")).toBeVisible();
  const [closedResponse] = await Promise.all([responseTo("/close"), page.getByRole("button", { name: "Cerrar el día", exact: true }).click()]);
  expect(closedResponse.status(), "Cierre durable desde la app").toBe(200);
  const closed: Snapshot = await closedResponse.json();
  expect(closed.today.closed).toBe(true);
  expect(closed.today.bonus).toBeGreaterThan(0);
  expect(closed.balance - opened.balance).toBe(closed.today.bonus);
  expect(closed.streak).toBe(opened.streak);
  expect(await body<Snapshot>(await request.post(`${rewards}/close`, { headers, data: { localDate: initial.today.localDate } }), "Reintento del cierre")).toEqual(closed);
  expect(await get()).toEqual(closed);
  expect(closed.legacyBalance).toBe(initial.legacyBalance);
  expect(closed.level).toBeGreaterThanOrEqual(initial.level);
  expect((await request.post(`${program}/tasks/complete`, { headers, data: {
    enrollmentId, localDate: initial.today.localDate, taskCode: "podcast", clientRequestId: "kan178-retired",
  } })).status(), "la ruta antigua tampoco otorga XP tras el corte").toBe(422);
  expect(await history()).toEqual(legacy);
  await page.reload();
  await expect(page.getByText(`${new Intl.NumberFormat("es-ES").format(closed.balance)} XP`, { exact: true })).toBeVisible();
  await expect(page.getByText("Nivel 7 · Líder", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver mi plan de bienestar" }).click();
  await page.getByRole("button", { name: "Continuar mi plan" }).click();
  await expect(page.getByText("Cofre abierto hoy. Vuelve mañana.")).toBeVisible();
});

test("KAN-178 · el cierre real de Motor 365 otorga el bonus una sola vez", async ({ page, request }) => {
  const password = process.env.KAN178_MOTOR_PASSWORD;
  test.skip(!password, "Requiere el tercer paciente con plan y consentimientos sintéticos.");
  const mobile = new URL(process.env.KAN178_MOBILE_URL ?? "http://127.0.0.1:5188");
  if (mobile.protocol !== "http:" || mobile.hostname !== "127.0.0.1" || mobile.href !== `${mobile.origin}/`)
    throw new Error("KAN-178 requiere una app HTTP local.");
  const session = await body<{ accessToken: string }>(await page.request.post(`${mobile.origin}/api/auth/login`, { data: {
    email: "patient-kan178-motor@example.test", password, application: "app", rememberMe: false,
  } }), "Auth paciente Motor 365");
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const { id: account } = await body<{ id: string }>(await request.get("/api/auth/me", { headers }), "Identidad real del paciente Motor 365");
  const rewards = "/api/v1/people/me/protocol-rewards";
  type Status = { today: { localDate: string; bonus: number; closed: boolean }; balance: number; streak: number };
  const current = () => request.get(rewards, { headers }).then(response => body<Status>(response, "Rewards de Motor 365"));
  const start = await current();
  const localDate = start.today.localDate;
  const plan = await body<{ today: number; logStatus: string }>(await request.get("/api/v1/people/me/plan", { headers }), "Plan real Motor 365");
  expect(plan.logStatus).toBe("open");
  for (const step of ["exercise", "diet", "vitals", "emotional", "chest"])
    await body(await request.post(`${rewards}/steps`, { headers, data: { step, localDate } }), `Paso ${step}`);
  const opened = await current();
  expect(opened.today).toMatchObject({ closed: false, bonus: 0 });
  expect((await request.post(`${rewards}/close`, { headers, data: { localDate } })).status()).toBe(409);

  await page.addInitScript(actor => {
    localStorage.setItem("antares_lang", "es");
    const at = new Date().toISOString();
    localStorage.setItem("copp.wellness-privacy.audit.v1.kan178", JSON.stringify({
      action: "accepted", actor, scope: "sensitive-data", at, acceptedAt: at, version: "2026-11-25-draft.1",
    }));
  }, account);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(mobile.origin);
  await page.getByRole("button", { name: "Ver mi plan de bienestar" }).click();
  await page.getByRole("button", { name: "Continuar mi plan" }).click();
  await page.getByRole("button", { name: "Cerrar el día", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registro de hoy" })).toBeVisible();
  for (const [name, value] of [["adherence", "100"], ["sleepHours", "7"], ["energy", "4"], ["pain", "0"]])
    await page.locator(`input[name="${name}"]`).fill(value);
  await page.getByRole("radio", { name: "Sí", exact: true }).click();
  const [put] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/logs/${plan.today}`) && response.request().method() === "PUT"),
    page.getByRole("button", { name: "Cerrar el día", exact: true }).click(),
  ]);
  expect(put.status()).toBe(204);
  await expect(page.getByText("Cierre sincronizado.")).toBeVisible();
  const closed = await current();
  expect(closed.today).toMatchObject({ closed: true, bonus: 20 });
  expect(closed.balance - opened.balance).toBe(20);
  expect(closed.streak).toBe(opened.streak);
  const replay = await request.put(`/api/v1/people/me/logs/${plan.today}?createIfAbsent=true`, { headers, data: put.request().postDataJSON() });
  expect(replay.status()).toBe(204);
  expect(await current()).toEqual(closed);
});

test("KAN-178 · el mismo cambio entra en vigor en dos medianoches distintas", async ({ page, request }) => {
  const clock = process.env.KAN178_CLOCK_FILE;
  test.skip(!clock, "Requiere el reloj del host E2E real y dos pacientes de prueba.");
  const setClock = (stamp: string) => {
    const file = clock!;
    writeFileSync(`${file}.next`, stamp, "utf8");
    renameSync(`${file}.next`, file);
  };
  const auth = "/api/auth/login";
  const base = "/api/v1/people/me/protocol-rewards";
  type Day = { localDate: string; steps: Record<string, number> };
  type Snapshot = { today: Day; history: Day[]; streak: number; longestStreak: number; receipt?: { created: boolean } };
  const login = async (email: string, password: string) => {
    const result = await body<{ accessToken: string }>(await request.post(auth, { data: { email, password, application: "app", rememberMe: false } }), "Auth paciente aislado");
    return { Authorization: `Bearer ${result.accessToken}` };
  };
  try {
    setClock("2031-01-10T22:00:00.000Z");
    await body(await page.request.post(auth, { data: {
      email: "erp-kan178@example.test", password: required("KAN178_ERP_PASSWORD"), application: "erp", rememberMe: false,
    } }), "Auth ERP sintético");
    const bogota = await login("patient-kan178@example.test", required("KAN178_PATIENT_PASSWORD"));
    const tokyo = await login("patient-kan178-east@example.test", required("KAN178_EAST_PASSWORD"));
    const get = (headers: typeof bogota) => request.get(base, { headers }).then(response => body<Snapshot>(response, "Protocolo de hoy"));
    const award = (headers: typeof bogota, localDate: string, step = "exercise") => request.post(`${base}/steps`, {
      headers, data: { step, localDate },
    }).then(response => body<Snapshot>(response, `${step} ${localDate}`));
    const open = async (date: string) => {
      for (const step of ["diet", "vitals", "emotional"]) await award(bogota, date, step);
      const receipts = await Promise.all([award(bogota, date, "chest"), award(bogota, date, "chest")]);
      expect(receipts.map(entry => entry.receipt?.created).sort()).toEqual([false, true]);
      return receipts[0];
    };
    expect((await get(bogota)).today.localDate).toBe("2031-01-10");
    expect((await get(tokyo)).today.localDate).toBe("2031-01-11");
    await editRule(page, 47, "PROTOCOL_EXERCISE");

    setClock("2031-01-11T04:59:59.000Z");
    expect((await award(bogota, "2031-01-10")).today.steps.exercise).toBe(10);
    expect((await open("2031-01-10")).streak).toBe(1);
    expect((await award(tokyo, "2031-01-11")).today.steps.exercise).toBe(10);
    expect((await request.post(`${base}/steps`, { headers: bogota, data: { step: "diet", localDate: "2031-01-11" } })).status()).toBe(409);

    setClock("2031-01-11T05:00:00.000Z");
    expect((await get(bogota)).today.steps).toEqual({});
    const west = await award(bogota, "2031-01-11");
    expect(west.today.steps.exercise).toBe(47);
    expect(west.history.find(entry => entry.localDate === "2031-01-10")?.steps.exercise).toBe(10);
    expect((await get(tokyo)).today).toMatchObject({ localDate: "2031-01-11", steps: { exercise: 10 } });
    expect((await open("2031-01-11")).streak).toBe(2);

    setClock("2031-01-11T14:59:59.000Z");
    expect((await get(tokyo)).today.localDate).toBe("2031-01-11");
    setClock("2031-01-11T15:00:00.000Z");
    const east = await award(tokyo, "2031-01-12");
    expect(east.today.steps.exercise).toBe(47);
    expect(east.history.find(entry => entry.localDate === "2031-01-11")?.steps.exercise).toBe(10);
    setClock("2031-01-13T05:00:00.000Z");
    expect(await get(bogota)).toMatchObject({ streak: 0, longestStreak: 2 });
  } finally {
    setClock(new Date().toISOString());
  }
});
