import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const fixturePath = process.env.COP_MEDICATION_PUSH_FIXTURE;
test.skip(!fixturePath, "Requiere la base aislada de notificaciones KAN-78");

test("delivery at the local time, inbox navigation, snooze and cancellation", async ({ browser, request }) => {
  const fixture = JSON.parse(readFileSync(fixturePath!, "utf8"));
  expect(fixture.database).toMatch(/^copp_review_medications_kan78_/);
  expect(fixture.gateway).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const gateway: string = fixture.gateway;
  const options = { locale: "es-CO", timezoneId: "America/Bogota" };
  const staff = await browser.newPage(options);
  const patient = await browser.newPage({ ...options, viewport: { width: 390, height: 844 } });
  const testDay = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
  const at = (minutes: number) => new Date(testDay.getTime() + minutes * 60_000);
  const localTime = (minutes: number) => new Intl.DateTimeFormat("en-GB", {
    timeZone: options.timezoneId, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(at(minutes));
  const setTime = async (minutes: number) => {
    const utcNow = at(minutes);
    expect((await request.post(gateway + "/__qa/clock", { data: { utcNow } })).ok()).toBe(true);
    await Promise.all([staff.clock.setFixedTime(utcNow), patient.clock.setFixedTime(utcNow)]);
  };
  const sweep = async () => {
    const result = await request.post(gateway + "/__qa/medications/push-sweep");
    expect(result.ok()).toBe(true);
    return result.json() as Promise<Array<{ token: string; title: string; body: string; data: Record<string, string> }>>;
  };
  const suffix = randomUUID().slice(0, 8);
  const names = { main: `Aviso QA ${suffix}`, paused: `Pausada QA ${suffix}`, edited: `Editada QA ${suffix}`, taken: `Confirmada QA ${suffix}` };
  const create = async (name: string, minutes: number) => {
    await staff.getByRole("button", { name: "Nuevo plan de medicación", exact: true }).click();
    await staff.getByRole("button", { name: "Entrada manual", exact: true }).click();
    await staff.getByLabel("Nombre del producto", { exact: true }).fill(name);
    await staff.getByLabel("Horario 1", { exact: true }).fill(localTime(minutes));
    await staff.getByRole("button", { name: "Guardar plan de medicación", exact: true }).click();
    const row = staff.locator(".medication-treatment-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    return row;
  };
  const inbox = patient.locator(".notifications-modal");
  const notices = inbox.getByText("Recordatorio de medicación", { exact: true });
  const openInbox = () => patient.getByRole("button", { name: /^Notificaciones(?: sin leer:.*)?$/ }).click();
  try {
    await setTime(-1);
    await Promise.all([staff.goto("http://127.0.0.1:3100/login"), patient.goto("http://127.0.0.1:5188")]);
    await staff.locator("#email").fill(fixture.accounts.manager.login);
    await staff.locator("#password").fill(fixture.accounts.manager.password);
    await staff.getByRole("slider", { name: "Comencemos", exact: true }).press("End");
    await expect(staff).toHaveURL(/\/dashboard/);
    const authenticated = patient.waitForRequest(req => req.url().includes("/notifications?") && !!req.headers().authorization);
    await patient.locator("#login-id input").fill(fixture.accounts.patient.documentNumber);
    await patient.locator("#login-password input").fill(fixture.accounts.patient.password);
    await patient.getByRole("button", { name: "Ingresar", exact: true }).click();
    const authorization = (await authenticated).headers().authorization;
    for (const [platform, language] of [["android", "es"], ["ios", "en"]]) {
      const registered = await request.post(gateway + "/api/v1/notifications/devices", {
        headers: { authorization }, data: { token: `kan78-${platform}-${suffix}`, platform, language },
      });
      expect(registered.ok()).toBe(true);
    }

    await staff.goto("http://127.0.0.1:3100/medications/" + fixture.patientId);
    await create(names.main, 0);
    const paused = await create(names.paused, 1);
    await paused.getByRole("button", { name: "Pausar", exact: true }).click();
    await staff.getByLabel("Motivo de suspensión").fill("Validación de recordatorios QA");
    await staff.getByRole("button", { name: "Confirmar suspensión", exact: true }).click();
    await expect(paused).toContainText("Pausado");
    const edited = await create(names.edited, 2);
    await edited.getByRole("button", { name: "Editar dosis y horarios", exact: true }).click();
    await staff.getByLabel("Horario 1", { exact: true }).fill(localTime(60));
    await staff.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(edited).toContainText(localTime(60));
    await create(names.taken, 3);

    const own = (deliveries: Awaited<ReturnType<typeof sweep>>) => deliveries.filter(item => item.token.endsWith(suffix));
    expect(own(await sweep())).toHaveLength(0);
    await setTime(0);
    await Promise.all([sweep(), sweep()]);
    const first = own(await sweep());
    expect(first.map(item => item.title).sort()).toEqual(["Medication reminder", "Recordatorio de medicación"]);
    for (const message of first) {
      expect(message.data).toEqual({ type: "medication_reminder", screen: "medications", notificationId: expect.any(String) });
      expect(message.body).not.toContain(names.main);
    }
    expect(first[0].data.notificationId).toBe(first[1].data.notificationId);
    await openInbox();
    await expect(notices).toHaveCount(1);
    const markRead = patient.waitForResponse(response => response.url().endsWith(`/${first[0].data.notificationId}/read`));
    await notices.click();
    expect((await markRead).status()).toBe(204);
    await expect(patient.getByRole("heading", { name: "Mi medicación", exact: true })).toBeVisible();

    await setTime(3);
    await patient.getByRole("button", { name: "Actualizar medicamentos" }).click();
    const logged = patient.locator(".medications-dose").filter({ hasText: names.taken });
    await logged.getByRole("button", { name: "Ya lo tomé", exact: true }).click();
    await expect(logged.getByText("Tomado", { exact: true })).toBeVisible();
    const main = patient.locator(".medications-dose").filter({ hasText: names.main });
    await main.getByRole("button", { name: "Posponer 15 min", exact: true }).click();
    await expect(main.getByText("Recordatorio pospuesto", { exact: true })).toBeVisible();
    await setTime(17);
    expect(own(await sweep())).toHaveLength(2);
    await setTime(18);
    const followUp = own(await sweep());
    expect(followUp).toHaveLength(4);
    expect(followUp[2].data.notificationId).not.toBe(first[0].data.notificationId);
    await setTime(33);
    expect(own(await sweep())).toHaveLength(4);
    await setTime(60);
    expect(own(await sweep())).toHaveLength(6);
  } finally {
    await request.post(gateway + "/__qa/clock", { data: { utcNow: null } });
    await Promise.all([staff.close(), patient.close()]);
  }
});
