import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const erp = "http://127.0.0.1:3160";
const app = "http://127.0.0.1:5189";
const fixturePath = process.env.COP_MEDICATION_COMPLETION_FIXTURE;
test.skip(!fixturePath, "Requires the isolated KAN-75 fixture");

test("ERP edits a prescription, the open app records and corrects it, and ERP updates without reloading", async ({ browser }) => {
  expect(fixturePath).toMatch(/^\/tmp\//);
  const fixture = JSON.parse(readFileSync(fixturePath!, "utf8"));
  expect(fixture.database).toMatch(/^copp_review_medications_kan75_/);
  const options = { locale: "es-CO", timezoneId: "America/Bogota" };
  const staff = await browser.newPage(options);
  const patient = await browser.newPage({ ...options, viewport: { width: 390, height: 844 } });
  try {
    await Promise.all([staff.goto(erp + "/login"), patient.goto(app)]);
    await staff.locator("#email").fill(fixture.accounts.manager.login);
    await staff.locator("#password").fill(fixture.accounts.manager.password);
    await staff.getByRole("slider", { name: "Comencemos", exact: true }).press("End");
    await expect(staff).toHaveURL(/\/dashboard/);
    await patient.locator("#login-id input").fill(fixture.accounts.patient.documentNumber);
    await patient.locator("#login-password input").fill(fixture.accounts.patient.password);
    await patient.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(patient.locator(".wheel")).toBeVisible({ timeout: 40_000 });
    await patient.locator(".wheel").getByRole("button", { name: "Medicamentos", exact: true }).click();

    await staff.goto(erp + "/medications/" + fixture.patientId);
    await staff.getByRole("button", { name: "Nuevo tratamiento", exact: true }).click();
    const name = "Plan QA " + randomUUID().slice(0, 8);
    await staff.getByLabel("Nombre del producto", { exact: true }).fill(name);
    await staff.getByLabel("Horario 1", { exact: true }).fill("00:01");
    await staff.getByRole("button", { name: "Guardar tratamiento", exact: true }).click();
    const treatment = staff.locator(".medication-treatment-row").filter({ hasText: name });
    await expect(treatment).toBeVisible();
    await treatment.getByRole("button", { name: "Editar dosis y horarios", exact: true }).click({ timeout: 5_000 });
    await staff.getByLabel("Horario 1", { exact: true }).fill("23:59");
    await staff.getByLabel("Cantidad por toma", { exact: true }).fill("2");
    await staff.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(treatment).toContainText("23:59");
    await staff.getByRole("tab", { name: "Hoy", exact: true }).click();

    const dose = patient.getByRole("region", { name: "Plan asignado", exact: true })
      .locator(".medications-dose").filter({ hasText: name });
    await expect(dose).toHaveCount(2);
    await expect(dose.filter({ hasText: "Atrasada" })).toContainText("1 tableta");
    await expect(dose.filter({ hasNotText: "Atrasada" })).toContainText("2 tableta");
    const due = dose.filter({ hasText: "Atrasada" });
    await due.getByRole("button", { name: "Ya lo tomé", exact: true }).click();
    await expect(due).toHaveCount(0);
    const erpDose = staff.locator(".medication-dose-row").filter({ hasText: name });
    await expect(erpDose.filter({ hasText: "Tomado" })).toHaveCount(1);
    await staff.getByRole("tab", { name: "Historial", exact: true }).click();
    const record = staff.locator(".medication-event-row").filter({ hasText: name }).first();
    await expect(record.getByText("App", { exact: true })).toBeVisible();
    await expect(record.getByText("Tomado", { exact: true })).toBeVisible();
    await dose.getByRole("button", { name: "Deshacer toma", exact: true }).click();
    await expect(record.getByText("Toma deshecha", { exact: true })).toBeVisible();
    await staff.getByRole("tab", { name: "Semana y día", exact: true }).click();
    await expect(staff.getByText("Adherencia de 30 días", { exact: true })).toBeVisible();

    await patient.getByRole("button", { name: "Recordatorios de medicación", exact: true }).click();
    const settings = patient.locator('ion-modal[aria-label="Recordatorios de medicación"]');
    const push = settings.locator("ion-toggle").filter({ hasText: "Notificaciones push" });
    await expect(push).toBeVisible();
    await push.click();
    const saved = patient.waitForResponse(response =>
      response.url().endsWith("/medications/reminder-preferences") && response.request().method() === "PUT");
    await settings.getByRole("button", { name: "Guardar", exact: true }).click();
    expect((await saved).ok()).toBe(true);

    await staff.getByRole("tab", { name: "Tratamientos", exact: true }).click();
    await treatment.getByRole("button", { name: "Pausar", exact: true }).click();
    const suspension = staff.getByRole("dialog", { name: "Suspender tratamiento" });
    await suspension.getByLabel("Motivo de suspensión").fill("QA: final de la prueba");
    await suspension.getByRole("button", { name: "Confirmar suspensión" }).click();
    await expect(treatment).toContainText("Pausado");
    await expect(dose).toHaveCount(1);
  } finally {
    await Promise.all([staff.close(), patient.close()]);
  }
});

async function setWhatsAppReminder(page: Page, enabled: boolean) {
  await page.getByRole("button", { name: "Recordatorios de medicación", exact: true }).click();
  const settings = page.locator('ion-modal[aria-label="Recordatorios de medicación"]');
  const toggle = settings.locator("ion-toggle").filter({ hasText: "WhatsApp" });
  const checked = await toggle.evaluate(element => (element as HTMLElement & { checked: boolean }).checked);
  if (checked === enabled) {
    await settings.getByRole("button", { name: "Cancelar", exact: true }).click();
  } else {
    await toggle.click();
    const saved = page.waitForResponse(response =>
      response.url().endsWith("/medications/reminder-preferences") && response.request().method() === "PUT");
    await settings.getByRole("button", { name: "Guardar", exact: true }).click();
    expect((await saved).ok()).toBe(true);
  }
  await expect(settings).toBeHidden();
}

test("an interval prescription supports durable snoozes and opted-in WhatsApp replies", async ({ browser, request }) => {
  expect(fixturePath).toMatch(/^\/tmp\//);
  const fixture = JSON.parse(readFileSync(fixturePath!, "utf8"));
  expect(fixture.database).toMatch(/^copp_review_medications_kan75_/);
  expect(fixture.gateway).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const gateway: string = fixture.gateway;
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date());
  const [hour, minute] = localTime.split(":").map(Number);
  const anchor = Math.max(0, hour * 60 + minute - 5);
  const scheduled = [Math.floor(anchor / 60), anchor % 60].map(value => String(value).padStart(2, "0")).join(":");
  const remainingDoses = 1 + Math.floor((1439 - anchor) / (5 * 60));
  const options = { locale: "es-CO", timezoneId: "America/Bogota" };
  const staff = await browser.newPage(options);
  const patient = await browser.newPage({ ...options, viewport: { width: 320, height: 750 } });
  const sweep = async (channel: string) => {
    const response = await request.post(gateway + "/__qa/medications/sweep?channel=" + channel);
    expect(response.ok()).toBe(true);
    return response.json() as Promise<Array<{ id: string; dose: { id: string; name: string } }>>;
  };
  try {
    await Promise.all([staff.goto(erp + "/login"), patient.goto(app)]);
    await staff.locator("#email").fill(fixture.accounts.manager.login);
    await staff.locator("#password").fill(fixture.accounts.manager.password);
    await staff.getByRole("slider", { name: "Comencemos", exact: true }).press("End");
    await expect(staff).toHaveURL(/\/dashboard/);
    await patient.locator("#login-id input").fill(fixture.accounts.patient.documentNumber);
    await patient.locator("#login-password input").fill(fixture.accounts.patient.password);
    await patient.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(patient.locator(".wheel")).toBeVisible({ timeout: 40_000 });
    await patient.locator(".wheel").getByRole("button", { name: "Medicamentos", exact: true }).click();
    await setWhatsAppReminder(patient, false);

    await staff.goto(erp + "/medications/" + fixture.patientId);
    await staff.getByRole("button", { name: "Nuevo tratamiento", exact: true }).click();
    const name = "Intervalo QA " + randomUUID().slice(0, 8);
    await staff.getByLabel("Nombre del producto", { exact: true }).fill(name);
    await staff.getByLabel("Frecuencia", { exact: true }).selectOption("interval");
    await staff.getByLabel("Horas entre tomas").fill("5");
    await staff.getByLabel("Horario 1", { exact: true }).fill(scheduled);
    await staff.getByRole("button", { name: "Guardar tratamiento", exact: true }).click();
    const doses = patient.locator(".medications-dose").filter({ hasText: name });
    await expect(doses).toHaveCount(remainingDoses);
    await expect(doses.first()).toContainText(scheduled);
    const initial = doses.first();
    await initial.getByRole("button", { name: "Posponer 15 min", exact: true }).click();
    await expect(initial.getByText("Recordatorio pospuesto", { exact: true })).toBeVisible();
    await patient.getByRole("button", { name: "Actualizar medicamentos" }).click();
    await expect(initial.getByText("Recordatorio pospuesto", { exact: true })).toBeVisible();
    expect((await sweep("app")).some(delivery => delivery.dose.name === name)).toBe(false);
    expect((await sweep("whatsapp")).some(delivery => delivery.dose.name === name)).toBe(false);

    await setWhatsAppReminder(patient, true);
    const delivery = (await sweep("whatsapp")).find(row => row.dose.name === name);
    expect(delivery).toBeDefined();
    expect((await sweep("whatsapp")).some(row => row.dose.name === name)).toBe(false);
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await request.post(gateway + "/__qa/medications/whatsapp-reply", {
        data: { id: delivery!.id, action: "taken" },
      });
      expect(await reply.json()).toEqual({ applied: true });
    }
    await expect(initial.getByText("Tomado", { exact: true })).toBeVisible();
    await staff.getByRole("tab", { name: "Historial", exact: true }).click();
    const event = staff.locator(".medication-event-row").filter({ hasText: name });
    await expect(event).toHaveCount(1);
    await expect(event.getByText("WhatsApp", { exact: true })).toBeVisible();
    await setWhatsAppReminder(patient, false);
  } finally {
    await Promise.all([staff.close(), patient.close()]);
  }
});
