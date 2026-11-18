import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const file = process.env.COP_MEDICATION_FIXTURE;
if (!file?.startsWith("/tmp/"))
  throw new Error("Private local QA fixture required");
const f = JSON.parse(readFileSync(file, "utf8"));
if (!f.database.startsWith("copp_review_medications_monitoring_"))
  throw new Error("Dedicated monitoring database required");
const gateway = "http://127.0.0.1:5160",
  app = "http://127.0.0.1:5189",
  erp = "http://127.0.0.1:3160";
async function token(c: BrowserContext, role: string) {
  const r = await c.request.post(gateway + "/api/auth/login", {
    data: {
      email: f.accounts[role].login,
      password: f.accounts[role].password,
      application:
        role === "patient" || role === "otherPatient" ? "app" : "erp",
    },
  });
  expect(r.status()).toBe(200);
  const headers = { Authorization: "Bearer " + (await r.json()).accessToken };
  await c.clearCookies();
  return headers;
}
async function staffLogin(p: Page, role = "manager") {
  await p.goto(erp + "/login");
  await p.locator("#email").fill(f.accounts[role].login);
  await p.locator("#password").fill(f.accounts[role].password);
  await p.getByRole("slider", { name: "Comencemos", exact: true }).press("End");
  await expect(p).toHaveURL(/\/dashboard/);
}
async function patientLogin(p: Page) {
  await p.goto(app);
  await p.locator("#login-id input").fill(f.accounts.patient.documentNumber);
  await p.locator("#login-password input").fill(f.accounts.patient.password);
  await p.getByRole("button", { name: "Ingresar", exact: true }).click();
  await p
    .locator(".wheel")
    .getByRole("button", { name: "Medicamentos", exact: true })
    .click();
}
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Bogota",
});
const query = "?timeZone=America%2FBogota";

test("HTML completo: inventario APP → tomas/stock → semana ERP → efectos/alertas → auditoría/exportación", async ({
  browser,
}, info) => {
  const sc = await browser.newContext({
    locale: "es-CO",
    timezoneId: "America/Bogota",
    viewport: { width: 1440, height: 1000 },
  });
  const pc = await browser.newContext({
    locale: "es-CO",
    timezoneId: "America/Bogota",
    viewport: { width: 390, height: 844 },
  });
  const staff = await sc.newPage(),
    patient = await pc.newPage();
  staff.setDefaultTimeout(15000);
  patient.setDefaultTimeout(15000);
  try {
    const sh = await token(sc, "manager"),
      ph = await token(pc, "patient");
    const name = "Medicina seguimiento QA " + randomUUID().slice(0, 6);
    const created = await sc.request.post(
      gateway + "/api/v1/medications/patients/" + f.patientId + "/treatments",
      {
        headers: sh,
        data: {
          clientRequestId: randomUUID(),
          medicationId: null,
          name,
          productType: "medication",
          dosage: 1,
          unit: "tableta",
          route: "oral",
          instructions: "Prueba sintética",
          times: ["00:01", "23:59"],
          timeZone: "America/Bogota",
          startDate: today,
          endDate: null,
        },
      },
    );
    expect(created.status()).toBe(201);
    const treatment = await created.json();
    await staffLogin(staff);
    await staff.goto(erp + "/medications");
    const nav = staff.getByRole("navigation", {
      name: "Vistas de medicamentos",
      exact: true,
    });
    await expect(
      nav.getByRole("link", { name: "Seguimiento diario", exact: true }),
    ).toBeVisible(); // Rojo: faltan secciones HTML.
    await expect(
      nav.getByRole("link", { name: "Inventario global", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Alertas", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Auditoría", exact: true }),
    ).toBeVisible();
    await patientLogin(patient);
    await patient.locator('ion-segment-button[value="inventory"]').click();
    const stock = patient
      .locator(".medications-stock-card")
      .filter({ hasText: name });
    await stock
      .getByRole("button", { name: "Registrar existencias", exact: true })
      .click();
    await patient
      .getByRole("textbox", { name: "Cantidad", exact: true })
      .fill("14");
    await patient
      .getByRole("button", { name: "Guardar inventario", exact: true })
      .click();
    await expect(stock).toContainText("14 tableta");
    await stock
      .getByRole("button", { name: "Añadir reposición", exact: true })
      .click();
    await patient
      .getByRole("textbox", { name: "Cantidad", exact: true })
      .fill("10");
    await patient
      .getByRole("button", { name: "Guardar inventario", exact: true })
      .click();
    await expect(stock).toContainText("24 tableta");
    await patient.locator('ion-segment-button[value="today"]').click();
    const dose = patient
      .getByRole("region", { name: "Plan asignado", exact: true })
      .locator(".medications-dose")
      .filter({ hasText: name })
      .first();
    await dose.getByRole("button", { name: "Ya lo tomé", exact: true }).click();
    await expect(dose).toContainText("Tomado");
    await patient.locator('ion-segment-button[value="inventory"]').click();
    await expect(stock).toContainText("23 tableta");
    const invUrl = gateway + "/api/v1/me/medications/inventory";
    const inventory = await (
      await pc.request.get(invUrl, { headers: ph })
    ).json();
    const supply = inventory.items.find(
      (x: { treatmentId: string }) => x.treatmentId === treatment.id,
    );
    expect(supply.balance).toBe(23);
    // Doble reposición y corrección de toma: no se duplica ni se pierde inventario.
    const movement = {
      clientRequestId: randomUUID(),
      kind: "refill",
      quantity: 1,
      expectedRevision: supply.revision,
      reason: null,
      expiresOn: null,
    };
    for (let i = 0; i < 2; i++)
      expect(
        (
          await pc.request.post(invUrl + "/" + treatment.id + "/movements", {
            headers: ph,
            data: movement,
          })
        ).status(),
      ).toBe(200);
    const reused = await pc.request.post(
      invUrl + "/" + treatment.id + "/movements",
      { headers: ph, data: { ...movement, quantity: 99 } },
    );
    expect(reused.status()).toBe(409);
    const ws = await (
      await pc.request.get(gateway + "/api/v1/me/medications" + query, {
        headers: ph,
      })
    ).json();
    const savedDose = ws.doses.find(
      (x: { treatmentId: string; status: string }) =>
        x.treatmentId === treatment.id && x.status === "taken",
    );
    const corrected = await sc.request.post(
      gateway +
        "/api/v1/medications/patients/" +
        f.patientId +
        "/doses/" +
        savedDose.id +
        "/events",
      {
        headers: sh,
        data: {
          clientRequestId: randomUUID(),
          status: "omitted",
          expectedRevision: savedDose.revision,
          reason: "Corrección de prueba",
          scheduledAt: savedDose.scheduledAt,
        },
      },
    );
    expect(corrected.status()).toBe(200);
    let afterCorrection = await (
      await pc.request.get(invUrl, { headers: ph })
    ).json();
    expect(
      afterCorrection.items.find(
        (x: { treatmentId: string }) => x.treatmentId === treatment.id,
      ).balance,
    ).toBe(25);
    // Un conteo físico nuevo cierra la conciliación anterior: corregir una toma previa no fabrica stock.
    const omittedDose = await corrected.json();
    const takenAgain = await sc.request.post(
      gateway +
        "/api/v1/medications/patients/" +
        f.patientId +
        "/doses/" +
        savedDose.id +
        "/events",
      {
        headers: sh,
        data: {
          clientRequestId: randomUUID(),
          status: "taken",
          expectedRevision: omittedDose.revision,
          reason: "Confirmación de prueba",
          scheduledAt: savedDose.scheduledAt,
        },
      },
    );
    expect(takenAgain.status()).toBe(200);
    const beforeCount = (
      await (await pc.request.get(invUrl, { headers: ph })).json()
    ).items.find(
      (x: { treatmentId: string }) => x.treatmentId === treatment.id,
    );
    expect(
      (
        await pc.request.post(invUrl + "/" + treatment.id + "/movements", {
          headers: ph,
          data: {
            clientRequestId: randomUUID(),
            kind: "adjustment",
            quantity: 8,
            expectedRevision: beforeCount.revision,
            reason: "Conteo físico actualizado",
            expiresOn: null,
          },
        })
      ).status(),
    ).toBe(200);
    const secondCorrection = await sc.request.post(
      gateway +
        "/api/v1/medications/patients/" +
        f.patientId +
        "/doses/" +
        savedDose.id +
        "/events",
      {
        headers: sh,
        data: {
          clientRequestId: randomUUID(),
          status: "omitted",
          expectedRevision: (await takenAgain.json()).revision,
          reason: "Corrección tras conteo",
          scheduledAt: savedDose.scheduledAt,
        },
      },
    );
    expect(secondCorrection.status()).toBe(200);
    afterCorrection = await (
      await pc.request.get(invUrl, { headers: ph })
    ).json();
    expect(
      afterCorrection.items.find(
        (x: { treatmentId: string }) => x.treatmentId === treatment.id,
      ).balance,
    ).toBe(8);
    await nav
      .getByRole("link", { name: "Seguimiento diario", exact: true })
      .click();
    await staff
      .getByRole("combobox", { name: "Paciente", exact: true })
      .selectOption(f.patientId);
    await expect(
      staff.getByRole("table", { name: "Semana de medicamentos", exact: true }),
    ).toContainText(name);
    await staff
      .getByRole("button", { name: "Detalle del " + today, exact: true })
      .click();
    await expect(
      staff.getByRole("region", { name: "Detalle del día", exact: true }),
    ).toContainText("Omitido");
    await staff.screenshot({ path: info.outputPath("weekly-tracking.png") });
    await staff
      .getByRole("navigation", { name: "Vistas de medicamentos", exact: true })
      .getByRole("link", { name: "Inventario global", exact: true })
      .click();
    await expect(
      staff.getByRole("table", {
        name: "Inventario de pacientes",
        exact: true,
      }),
    ).toContainText(name);
    // Inventario bajo/expirado: alerta persistida, asignación y cierre con motivo.
    const current = afterCorrection.items.find(
      (x: { treatmentId: string }) => x.treatmentId === treatment.id,
    );
    const adjusted = await pc.request.post(
      invUrl + "/" + treatment.id + "/movements",
      {
        headers: ph,
        data: {
          clientRequestId: randomUUID(),
          kind: "adjustment",
          quantity: 2,
          expectedRevision: current.revision,
          reason: "Conteo de prueba",
          expiresOn: "2026-01-01",
        },
      },
    );
    expect(adjusted.status()).toBe(200);
    await patient.locator('ion-segment-button[value="effects"]').click();
    await patient
      .getByRole("button", { name: "Reportar síntoma", exact: true })
      .click();
    await patient
      .getByRole("textbox", { name: "Síntoma", exact: true })
      .fill("Náusea QA");
    await patient
      .getByRole("button", { name: "Enviar reporte", exact: true })
      .click();
    await expect(patient.locator(".medications-effect-card")).toContainText(
      "Náusea QA",
    );
    await staff
      .getByRole("navigation", { name: "Vistas de medicamentos", exact: true })
      .getByRole("link", { name: "Alertas", exact: true })
      .click();
    await expect(
      staff
        .locator(".medication-alert-row")
        .filter({ hasText: "Existencias bajas" }),
    ).toBeVisible();
    const low = staff
      .locator(".medication-alert-row")
      .filter({ hasText: "Existencias bajas" });
    await low.getByRole("button", { name: "Atender", exact: true }).click();
    await expect(low).toContainText("En seguimiento");
    await low.getByRole("button", { name: "Resolver", exact: true }).click();
    await staff
      .getByRole("textbox", { name: "Motivo del cierre", exact: true })
      .fill("Reposición coordinada en prueba");
    await staff
      .getByRole("button", { name: "Confirmar cierre", exact: true })
      .click();
    await staff.goto(erp + "/medications/" + f.patientId);
    await staff
      .getByRole("tab", { name: "Efectos reportados", exact: true })
      .click();
    const effect = staff
      .locator(".medication-effect-row")
      .filter({ hasText: "Náusea QA" });
    await effect.getByRole("button", { name: "Resolver", exact: true }).click();
    await staff
      .getByRole("textbox", { name: "Nota de seguimiento", exact: true })
      .fill("Seguimiento de prueba registrado");
    await staff
      .getByRole("button", { name: "Guardar seguimiento", exact: true })
      .click();
    await expect(effect).toContainText("Resuelto");
    // Exportación se entrega como archivo y queda atribuida con finalidad.
    const download = staff.waitForEvent("download");
    await staff
      .getByRole("button", { name: "Exportar seguimiento", exact: true })
      .click();
    expect((await download).suggestedFilename()).toMatch(
      /medicamentos.*\.csv$/,
    );
    await staff.goto(erp + "/medications/audit");
    await expect(
      staff.getByRole("table", {
        name: "Auditoría de medicamentos",
        exact: true,
      }),
    ).toContainText("Exportación");
    await expect(
      staff.getByRole("table", {
        name: "Auditoría de medicamentos",
        exact: true,
      }),
    ).toContainText("Consulta");
    await expect(
      staff.getByRole("table", {
        name: "Auditoría de medicamentos",
        exact: true,
      }),
    ).toContainText(f.accounts.manager.login);
    const actorResponse = staff.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/v1/medications/audit" &&
        new URL(r.url()).searchParams.has("actorId"),
    );
    await staff
      .getByRole("button", { name: f.accounts.manager.login, exact: true })
      .first()
      .click();
    const filtered = await actorResponse;
    expect(filtered.status()).toBe(200);
    expect(
      (await filtered.json()).items.every(
        (entry: { actorId: string }) =>
          entry.actorId === f.accounts.manager.userId,
      ),
    ).toBe(true);
    await staff
      .getByRole("button", { name: "Quitar filtro de usuario", exact: true })
      .click();
    await staff.screenshot({ path: info.outputPath("medication-audit.png") });
    // Ámbitos y privilegios reales.
    const reader = await token(sc, "reader");
    expect(
      (
        await sc.request.get(gateway + "/api/v1/medications/audit", {
          headers: reader,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await sc.request.get(
          gateway +
            "/api/v1/medications/patients/" +
            f.patientId +
            "/export" +
            query,
          { headers: reader },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await sc.request.post(
          gateway +
            "/api/v1/medications/patients/" +
            f.patientId +
            "/inventory/" +
            treatment.id +
            "/movements",
          {
            headers: reader,
            data: { ...movement, clientRequestId: randomUUID() },
          },
        )
      ).status(),
    ).toBe(403);
    const other = await token(pc, "otherPatient");
    expect(
      (
        await pc.request.post(invUrl + "/" + treatment.id + "/movements", {
          headers: other,
          data: { ...movement, clientRequestId: randomUUID() },
        })
      ).status(),
    ).toBe(404);
    await patient.setViewportSize({ width: 320, height: 844 });
    expect(
      await patient.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } catch (error) {
    if (!staff.url().includes("/login"))
      await staff
        .screenshot({ path: info.outputPath("erp-failure.png") })
        .catch(() => {});
    await patient
      .screenshot({ path: info.outputPath("app-failure.png") })
      .catch(() => {});
    throw error;
  } finally {
    await sc.close();
    await pc.close();
  }
});

test("Solo lectura, alertas temporales y bitácora inalterable por la aplicación", async ({
  browser,
}) => {
  const context = await browser.newContext({
    locale: "es-CO",
    timezoneId: "America/Bogota",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try {
    await staffLogin(page, "reader");
    await page.goto(erp + "/medications/inventory");
    await expect(
      page.getByRole("table", { name: "Inventario de pacientes", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Registrar movimiento", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", {
          name: "Vistas de medicamentos",
          exact: true,
        })
        .getByRole("link", { name: "Auditoría", exact: true }),
    ).toHaveCount(0);
    await page.goto(erp + "/medications/audit");
    await expect(
      page.getByRole("table", {
        name: "Auditoría de medicamentos",
        exact: true,
      }),
    ).toHaveCount(0);
    const sh = await token(context, "manager");
    const future = new Date(Date.now() + 2 * 86400000).toISOString();
    expect(
      (
        await context.request.post(gateway + "/__qa/clock", {
          data: { utcNow: future },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await context.request.post(gateway + "/__qa/medications/refresh")
      ).status(),
    ).toBe(200);
    const alerts = await (
      await context.request.get(gateway + "/api/v1/medications/alerts", {
        headers: sh,
      })
    ).json();
    expect(
      alerts.items.some(
        (a: { kind: string; status: string }) =>
          a.kind === "unrecorded" && a.status === "open",
      ),
    ).toBe(true);
    expect(
      alerts.items.some(
        (a: { kind: string; status: string }) =>
          a.kind === "low_adherence" && a.status === "open",
      ),
    ).toBe(true);
    const attempt = spawnSync(
      "docker",
      [
        "exec",
        "copp-medications-e2e",
        "psql",
        "-U",
        "app_user",
        "-d",
        f.database,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "UPDATE app.medication_audit_entries SET purpose='changed' WHERE id=(SELECT id FROM app.medication_audit_entries LIMIT 1)",
      ],
      { encoding: "utf8" },
    );
    expect(attempt.status).not.toBe(0);
    expect(attempt.stderr).toContain("append-only");
    await context.clearCookies();
    await staffLogin(page, "reader");
    await page.goto(erp + "/medications/alerts");
    await expect(
      page
        .locator(".medication-alert-row")
        .filter({ hasText: "Adherencia baja" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Atender", exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.request
      .post(gateway + "/__qa/clock", { data: { utcNow: null } })
      .catch(() => {});
    await context.request
      .post(gateway + "/__qa/medications/refresh")
      .catch(() => {});
    await context.close();
  }
});
