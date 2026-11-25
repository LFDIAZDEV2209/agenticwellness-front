import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

type Account = {
  userId: string;
  login: string;
  documentNumber: string;
  password: string;
};
type Fixture = {
  gateway: string;
  database: string;
  patientId: string;
  otherPatientId: string;
  clinicId: string;
  foreignClinicId: string;
  legacyMedicationId: string;
  legacyPatientMedicationId: string;
  accounts: Record<
    "patient" | "otherPatient" | "manager" | "reader" | "foreign" | "scoped",
    Account
  >;
  appleBaseline: {
    version: string;
    build: number;
    commit: string;
    binaryExecutionVerified: boolean;
  };
};
const fixturePath =
  process.env.COP_MEDICATION_FIXTURE ??
  "/tmp/copp-medication-e2e/fixture.private.json";
function local(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(u.hostname)
  )
    throw new Error("Medication E2E only permits local HTTP origins.");
  return u.origin;
}
const erp = local(
  process.env.COP_MEDICATION_ERP_URL ?? "http://127.0.0.1:3100",
);
const app = local(
  process.env.COP_MEDICATION_APP_URL ?? "http://127.0.0.1:5188",
);
function fixture() {
  if (!fixturePath.startsWith("/tmp/"))
    throw new Error("Private fixture must stay outside repositories.");
  const f = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
  if (!f.database.startsWith("copp_review_medications_"))
    throw new Error("Unsafe E2E database.");
  local(f.gateway);
  return f;
}
async function auth(
  context: BrowserContext,
  f: Fixture,
  role: keyof Fixture["accounts"],
) {
  const account = f.accounts[role];
  const response = await context.request.post(f.gateway + "/api/auth/login", {
    data: {
      email: account.login,
      password: account.password,
      application:
        role === "patient" || role === "otherPatient" ? "app" : "erp",
      rememberMe: false,
    },
  });
  expect(response.status(), `${role} real Auth login`).toBe(200);
  const token = (await response.json()).accessToken as string;
  expect(typeof token).toBe("string");
  return { Authorization: `Bearer ${token}` };
}
async function erpLogin(
  page: Page,
  f: Fixture,
  role: "manager" | "reader" = "manager",
) {
  await page.goto(erp + "/login");
  await page.locator("#email").fill(f.accounts[role].login);
  await page.locator("#password").fill(f.accounts[role].password);
  const slider = page.getByRole("slider", { name: "Comencemos", exact: true });
  await slider.focus();
  await slider.press("End");
  await expect(page).toHaveURL(/\/dashboard/);
}
async function appLogin(page: Page, f: Fixture) {
  await page.goto(app);
  await page.locator("#login-id input").fill(f.accounts.patient.documentNumber);
  await page.locator("#login-password input").fill(f.accounts.patient.password);
  await page.getByRole("button", { name: "Comencemos", exact: true }).click();
  await expect(page.locator("#login-id")).toHaveCount(0);
}
function dbValue(f: Fixture, sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "copp-medications-e2e",
      "psql",
      "-U",
      "app_user",
      "-d",
      f.database,
      "-At",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}
function localDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

test.beforeAll(async ({ request }) => {
  // El relay empieza a escuchar solo después de migrar, crear identidades y
  // publicar la nueva fixture privada; evita usar contraseñas de un host anterior.
  const gateway = local(
    process.env.COP_MEDICATION_GATEWAY_URL ?? "http://127.0.0.1:5160",
  );
  await expect
    .poll(
      async () => {
        try {
          return (
            await request.get(gateway + "/health", { timeout: 2_000 })
          ).status();
        } catch {
          return 0;
        }
      },
      { timeout: 60_000, message: "real API/Auth fixture is ready" },
    )
    .toBe(200);
});

test("baseline real: login/perfil existente y contrato nuevo de capacidades", async ({
  browser,
}, info) => {
  const f = fixture();
  const context = await browser.newContext();
  try {
    const headers = await auth(context, f, "patient");
    const profile = await context.request.get(
      f.gateway + "/api/v1/me/patient-profile",
      { headers },
    );
    expect(
      profile.status(),
      "existing build67 profile endpoint works before new feature",
    ).toBe(200);
    const capabilities = await context.request.get(
      f.gateway + "/api/v1/me/capabilities",
      { headers },
    );
    writeFileSync(
      info.outputPath("capabilities-baseline.json"),
      JSON.stringify(
        {
          apiInterception: false,
          postgres: true,
          profileStatus: profile.status(),
          capabilityStatus: capabilities.status(),
          expected: 200,
          build67Commit: f.appleBaseline.commit,
          binaryExecutionVerified: false,
        },
        null,
        2,
      ),
    );
    expect(
      capabilities.status(),
      "new capabilities endpoint absent on baseline",
    ).toBe(200);
    expect(typeof (await capabilities.json()).modules.medications.enabled).toBe(
      "boolean",
    );
  } finally {
    await context.close();
  }
});

test("ERP habilita → APP registra tratamiento/toma → ERP consulta el mismo historial", async ({
  browser,
}, info) => {
  const f = fixture();
  const staffContext = await browser.newContext();
  const patientContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const staff = await staffContext.newPage();
  const patient = await patientContext.newPage();
  try {
    await erpLogin(staff, f);
    await staff.goto(erp + `/medications/${f.patientId}`);
    await expect(
      staff.getByRole("heading", { name: /Paciente Medicamentos QA/ }).first(),
    ).toBeVisible();
    const activate = staff.getByRole("button", {
      name: "Activar acceso",
      exact: true,
    });
    if (await activate.isVisible()) await activate.click();
    await appLogin(patient, f);
    await patient
      .getByRole("button", { name: /Control de medicamentos|Medicamentos/ })
      .first()
      .click();
    await expect(
      patient.getByRole("heading", {
        name: "Control de medicamentos",
        exact: true,
      }),
    ).toBeVisible();
    await patient
      .getByRole("button", { name: "Añadir medicamento", exact: true })
      .click();
    const medicationName = "Tratamiento QA E2E " + randomUUID().slice(0, 8);
    await patient
      .getByRole("textbox", { name: "Nombre del medicamento", exact: true })
      .fill(medicationName);
    await patient
      .getByRole("textbox", { name: "Cantidad por toma", exact: true })
      .fill("1");
    await patient
      .getByRole("textbox", { name: "Unidad", exact: true })
      .fill("tableta");
    await patient
      .getByRole("textbox", { name: "Vía de administración", exact: true })
      .fill("oral");
    await patient
      .getByRole("textbox", { name: "Horarios", exact: true })
      .fill("00:00, 23:59");
    await patient
      .getByRole("button", { name: "Guardar medicamento", exact: true })
      .click();
    await expect(
      patient.getByText(medicationName, { exact: true }).first(),
    ).toBeVisible();
    const createdDose = patient
      .locator(".medications-dose")
      .filter({ hasText: medicationName })
      .first();
    await createdDose
      .getByRole("button", { name: "Ya lo tomé", exact: true })
      .click();
    await expect(
      createdDose.getByText("Tomado", { exact: true }),
    ).toBeVisible();
    await patient.screenshot({ path: info.outputPath("app-real-dose.png") });
    await staff.reload();
    await expect(
      staff.getByText(medicationName, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      staff
        .locator(".medication-dose-row")
        .filter({ hasText: medicationName })
        .first()
        .getByText("Tomado", { exact: true }),
    ).toBeVisible();
    await staff.getByRole("tab", { name: "Historial", exact: true }).click();
    await expect(
      staff
        .locator(".medication-event-row")
        .filter({ hasText: medicationName })
        .getByText("Tomado", { exact: true }),
    ).toBeVisible();
    await staff.screenshot({ path: info.outputPath("erp-real-history.png") });
    expect(
      Number(
        dbValue(
          f,
          `SELECT count(*) FROM app.medication_intake_events e JOIN app.medication_treatments t ON t.id=e.treatment_id WHERE t.name='${medicationName}' AND e.status='taken'`,
        ),
      ),
    ).toBe(1);
    expect(
      Number(
        dbValue(
          f,
          "SELECT count(*) FROM app.medication_treatments WHERE name LIKE 'Tratamiento QA E2E %'",
        ),
      ),
    ).toBeGreaterThan(0);
    const beforeProfileHistory = Number(
      dbValue(
        f,
        `SELECT count(*) FROM app.medication_intake_events WHERE patient_id='${f.patientId}'`,
      ),
    );
    await patient
      .getByRole("button", { name: "Mi perfil", exact: true })
      .click();
    await expect(patient.locator("#pf-email input")).toBeVisible();
    await patient
      .locator("#pf-email input")
      .fill(`medication.updated.${randomUUID().slice(0, 8)}@copp.test`);
    const savedProfile = patient.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/me/patient-profile" &&
        response.request().method() === "PUT",
      { timeout: 15_000 },
    );
    await patient
      .getByRole("button", { name: "Guardar contacto", exact: true })
      .click();
    expect(
      (await savedProfile).status(),
      "existing Profile UI save after medication history",
    ).toBe(200);
    expect(
      Number(
        dbValue(
          f,
          `SELECT count(*) FROM app.medication_intake_events WHERE patient_id='${f.patientId}'`,
        ),
      ),
    ).toBe(beforeProfileHistory);
    expect(
      dbValue(
        f,
        `SELECT id FROM app.patient_medications WHERE patient_id='${f.patientId}' AND medication_id='${f.legacyMedicationId}'`,
      ),
    ).toBe(f.legacyPatientMedicationId);
    expect(
      await patient.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await patientContext.close();
    await staffContext.close();
  }
});

test("persistencia, reintentos, perfil build67, alcance y retirada de acceso", async ({
  browser,
}, info) => {
  const f = fixture();
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext()),
  );
  try {
    const [patient, manager, reader, foreign, other] = contexts;
    const [pHeaders, mHeaders, rHeaders, fHeaders, oHeaders] =
      await Promise.all([
        auth(patient, f, "patient"),
        auth(manager, f, "manager"),
        auth(reader, f, "reader"),
        auth(foreign, f, "foreign"),
        auth(other, f, "otherPatient"),
      ]);
    const base = f.gateway + `/api/v1/medications/patients/${f.patientId}`;
    expect(
      (
        await manager.request.put(base + "/access", {
          headers: mHeaders,
          data: { enabled: true },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await manager.request.put(
          f.gateway + `/api/v1/medications/patients/${f.otherPatientId}/access`,
          { headers: mHeaders, data: { enabled: true } },
        )
      ).status(),
    ).toBe(200);
    expect(
      (await reader.request.get(base, { headers: rHeaders })).status(),
    ).toBe(200);
    expect(
      (await foreign.request.get(base, { headers: fHeaders })).status(),
    ).toBe(404);
    const readerList = await reader.request.get(
      f.gateway + "/api/v1/medications/patients?page=1&pageSize=20",
      { headers: rHeaders },
    );
    expect(readerList.status()).toBe(200);
    expect(
      (await readerList.json()).items.map(
        (x: { patientId: string }) => x.patientId,
      ),
    ).toEqual([f.patientId]);
    expect(
      (
        await reader.request.put(base + "/access", {
          headers: rHeaders,
          data: { enabled: false },
        })
      ).status(),
    ).toBe(403);
    const create = await patient.request.post(
      f.gateway + "/api/v1/me/medications/treatments",
      {
        headers: pHeaders,
        data: {
          clientRequestId: randomUUID(),
          medicationId: null,
          name: "Persistencia QA " + randomUUID().slice(0, 8),
          productType: "medication",
          dosage: 1,
          unit: "tableta",
          route: "oral",
          instructions: "Indicación existente de QA",
          times: ["00:00", "23:59"],
          timeZone: "America/Bogota",
          startDate: localDate(),
          endDate: null,
        },
      },
    );
    expect(create.status()).toBe(201);
    const treatment = await create.json();
    expect(
      (
        await reader.request.post(base + "/treatments", {
          headers: rHeaders,
          data: {
            clientRequestId: randomUUID(),
            medicationId: null,
            name: "Denied QA",
            productType: "medication",
            dosage: 1,
            unit: "tableta",
            times: ["08:00"],
            timeZone: "America/Bogota",
            startDate: localDate(),
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await reader.request.put(base + `/treatments/${treatment.id}/status`, {
          headers: rHeaders,
          data: { status: "paused", expectedRevision: treatment.revision },
        })
      ).status(),
    ).toBe(403);
    const current = await patient.request.get(
      f.gateway + "/api/v1/me/medications",
      { headers: pHeaders },
    );
    expect(current.status()).toBe(200);
    const workspace = await current.json();
    expect(workspace.patient.id).toBe(f.patientId);
    const due = workspace.doses.find(
      (x: { treatmentId: string; status: string; scheduledAt: string }) =>
        x.treatmentId === treatment.id &&
        x.status === "pending" &&
        new Date(x.scheduledAt).valueOf() <= Date.now(),
    );
    expect(due).toBeTruthy();
    expect(
      (
        await reader.request.post(base + `/doses/${due.id}/events`, {
          headers: rHeaders,
          data: {
            clientRequestId: randomUUID(),
            status: "taken",
            scheduledAt: due.scheduledAt,
            expectedRevision: due.revision,
          },
        })
      ).status(),
    ).toBe(403);
    const retry = {
      clientRequestId: randomUUID(),
      status: "taken",
      scheduledAt: due.scheduledAt,
      expectedRevision: due.revision,
    };
    const eventUrl =
      f.gateway + `/api/v1/me/medications/doses/${due.id}/events`;
    const [first, duplicate] = await Promise.all([
      patient.request.post(eventUrl, { headers: pHeaders, data: retry }),
      patient.request.post(eventUrl, { headers: pHeaders, data: retry }),
    ]);
    expect(first.status()).toBe(200);
    expect(duplicate.status()).toBe(200);
    expect(
      Number(
        dbValue(
          f,
          `SELECT count(*) FROM app.medication_intake_events WHERE dose_id='${due.id}'`,
        ),
      ),
    ).toBe(1);
    expect(
      (
        await patient.request.post(eventUrl, {
          headers: pHeaders,
          data: { ...retry, status: "omitted", reason: "Corrección QA" },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await other.request.post(eventUrl, {
          headers: oHeaders,
          data: { ...retry, clientRequestId: randomUUID() },
        })
      ).status(),
    ).toBe(404);
    const beforeProfile = await patient.request.get(
      f.gateway + "/api/v1/me/medications",
      { headers: pHeaders },
    );
    const beforeWorkspace = await beforeProfile.json();
    const legacySource = execFileSync(
      "git",
      [
        "-C",
        resolve(process.cwd(), "../antares-paciente"),
        "show",
        `${f.appleBaseline.commit}:src/utils/patientProfileApi.ts`,
      ],
      { encoding: "utf8" },
    );
    expect(legacySource).toContain('"/api/v1/me/patient-profile"');
    expect(legacySource).toContain("clearInsurer: body.insurerId === null");
    writeFileSync(
      info.outputPath("build67-patientProfileApi.ts"),
      legacySource,
    );
    const profileResponse = await patient.request.get(
      f.gateway + "/api/v1/me/patient-profile",
      { headers: pHeaders },
    );
    expect(profileResponse.status()).toBe(200);
    const profile = await profileResponse.json();
    const saved = await patient.request.put(
      f.gateway + "/api/v1/me/patient-profile",
      {
        headers: pHeaders,
        data: {
          dateOfBirth: profile.dateOfBirth,
          email: profile.email,
          phone: profile.phone,
          emergencyName: profile.emergencyName,
          emergencyRelationship: profile.emergencyRelationship,
          emergencyPhone: profile.emergencyPhone,
          emergencyEmail: profile.emergencyEmail,
          insurerId: profile.insurerId,
          memberId: profile.memberId,
          secondaryEmergencyContact: profile.secondaryEmergencyContact,
          clearInsurer: profile.insurerId === null,
        },
      },
    );
    expect(saved.status(), "unchanged build67 request shape").toBe(200);
    const after = await patient.request.get(
      f.gateway + "/api/v1/me/medications",
      { headers: pHeaders },
    );
    const afterWorkspace = await after.json();
    expect(afterWorkspace.history.map((x: { id: string }) => x.id)).toEqual(
      beforeWorkspace.history.map((x: { id: string }) => x.id),
    );
    expect(afterWorkspace.treatments.map((x: { id: string }) => x.id)).toEqual(
      workspace.treatments.map((x: { id: string }) => x.id),
    );
    expect(
      dbValue(
        f,
        `SELECT id FROM app.patient_medications WHERE patient_id='${f.patientId}' AND medication_id='${f.legacyMedicationId}'`,
      ),
    ).toBe(f.legacyPatientMedicationId);
    const generalProfile = await manager.request.get(
      f.gateway + `/api/v1/patients/${f.patientId}`,
      { headers: mHeaders },
    );
    expect(generalProfile.status()).toBe(200);
    const general = await generalProfile.json();
    const savedGeneral = await manager.request.put(
      f.gateway + `/api/v1/patients/${f.patientId}`,
      {
        headers: mHeaders,
        data: {
          ...general,
          notes: "Edición general QA de compatibilidad build67",
          medications: general.medications.map(
            (item: { medicationId: string; frequency: string | null }) => ({
              medicationId: item.medicationId,
              frequency: item.frequency,
            }),
          ),
        },
      },
    );
    expect(savedGeneral.status(), "ERP aggregate save remains compatible").toBe(
      200,
    );
    expect(
      dbValue(
        f,
        `SELECT id FROM app.patient_medications WHERE patient_id='${f.patientId}' AND medication_id='${f.legacyMedicationId}'`,
      ),
    ).toBe(f.legacyPatientMedicationId);
    expect(
      Number(
        dbValue(
          f,
          `SELECT count(*) FROM app.medication_intake_events WHERE dose_id='${due.id}'`,
        ),
      ),
    ).toBe(1);
    const readerPage = await reader.newPage();
    await erpLogin(readerPage, f, "reader");
    await readerPage.goto(erp + `/medications/${f.patientId}`);
    await expect(
      readerPage
        .getByRole("heading", { name: /Paciente Medicamentos QA/ })
        .first(),
    ).toBeVisible();
    await expect(
      readerPage.getByRole("button", {
        name: "Nuevo plan de medicación",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      readerPage.getByRole("button", {
        name: /Activar acceso|Desactivar acceso/,
      }),
    ).toHaveCount(0);
    const disable = await manager.request.put(base + "/access", {
      headers: mHeaders,
      data: { enabled: false, expectedRevision: workspace.access.revision },
    });
    expect(disable.status()).toBe(200);
    expect(
      (
        await patient.request.get(f.gateway + "/api/v1/me/medications", {
          headers: pHeaders,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await patient.request.get(f.gateway + "/api/v1/me/patient-profile", {
          headers: pHeaders,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await patient.request.post(eventUrl, {
          headers: pHeaders,
          data: { ...retry, clientRequestId: randomUUID() },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await patient.request.put(
          f.gateway +
            `/api/v1/me/medications/treatments/${treatment.id}/status`,
          {
            headers: pHeaders,
            data: { status: "paused", expectedRevision: treatment.revision },
          },
        )
      ).status(),
    ).toBe(403);
    const revokedContext = await browser.newContext();
    contexts.push(revokedContext);
    const revokedPage = await revokedContext.newPage();
    await appLogin(revokedPage, f);
    await expect(
      revokedPage
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Perfil", exact: true }),
    ).toBeVisible();
    await expect(
      revokedPage
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("button", { name: "Control de medicamentos", exact: true }),
    ).toHaveCount(0);
    writeFileSync(
      info.outputPath("real-integration.json"),
      JSON.stringify(
        {
          apiInterception: false,
          postgres: true,
          crossPatientDenied: true,
          crossProfessionalDenied: true,
          readerMutationDenied: true,
          duplicateDoseDidNotAddHistory: true,
          legacyProfileSavePreservedHistory: true,
          erpAggregateSavePreservedLegacyIds: true,
          moduleRevocationProtectedApi: true,
          build67ContractCommit: f.appleBaseline.commit,
          appleBinaryExecuted: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("scoped grants: capacidades y rutas de la misma clínica coinciden", async ({
  browser,
}) => {
  const f = fixture();
  const context = await browser.newContext();
  try {
    const headers = {
      ...(await auth(context, f, "scoped")),
      "X-Clinic-Id": f.clinicId,
    };
    const caps = await context.request.get(
      f.gateway + "/api/v1/me/capabilities",
      { headers },
    );
    expect(caps.status()).toBe(200);
    expect((await caps.json()).modules.medications).toMatchObject({
      canView: true,
      canManage: true,
      canManageAccess: false,
    });
    const workspace = await context.request.get(
      f.gateway + `/api/v1/medications/patients/${f.patientId}`,
      { headers },
    );
    expect(
      workspace.status(),
      "scoped capability permits the matching real route",
    ).toBe(200);
    const created = await context.request.post(
      f.gateway + `/api/v1/medications/patients/${f.patientId}/treatments`,
      {
        headers,
        data: {
          clientRequestId: randomUUID(),
          medicationId: null,
          name: "Scoped QA " + randomUUID().slice(0, 8),
          productType: "medication",
          dosage: 1,
          unit: "tableta",
          route: "oral",
          instructions: "QA",
          times: ["08:00"],
          timeZone: "America/Bogota",
          startDate: localDate(),
          endDate: null,
        },
      },
    );
    expect(
      created.status(),
      "scoped manage capability permits the matching write route",
    ).toBe(201);
    expect(
      (
        await context.request.put(
          f.gateway + `/api/v1/medications/patients/${f.patientId}/access`,
          {
            headers,
            data: { enabled: false },
          },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.get(
          f.gateway + `/api/v1/medications/patients/${f.otherPatientId}`,
          { headers },
        )
      ).status(),
    ).toBe(404);
    const foreignHeaders = { ...headers, "X-Clinic-Id": f.foreignClinicId };
    const deniedCaps = await context.request.get(
      f.gateway + "/api/v1/me/capabilities",
      { headers: foreignHeaders },
    );
    expect((await deniedCaps.json()).modules.medications.canView).toBe(false);
    expect(
      (
        await context.request.get(
          f.gateway + `/api/v1/medications/patients/${f.patientId}`,
          { headers: foreignHeaders },
        )
      ).status(),
    ).toBe(403);
  } finally {
    await context.close();
  }
});

test("GET de seguimiento es de solo lectura incluso para fechas nuevas", async ({
  browser,
}) => {
  const f = fixture();
  const context = await browser.newContext();
  try {
    const headers = await auth(context, f, "reader");
    const date = new Date(`${localDate()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 3);
    const futureDay = date.toISOString().slice(0, 10);
    const counts = () =>
      dbValue(
        f,
        "SELECT (SELECT count(*) FROM app.medication_doses)::text || ':' || (SELECT count(*) FROM app.medication_intake_events)::text",
      );
    const before = counts();
    const url =
      f.gateway +
      `/api/v1/medications/patients/${f.patientId}?date=${futureDay}&timeZone=America%2FBogota`;
    const first = await context.request.get(url, { headers });
    expect(first.status()).toBe(200);
    const second = await context.request.get(url, { headers });
    expect(second.status()).toBe(200);
    expect((await second.json()).doses).toEqual((await first.json()).doses);
    expect(
      counts(),
      "read-only GET must not insert occurrences or intake events",
    ).toBe(before);
  } finally {
    await context.close();
  }
});

test("clave de operación aceptada sin cambio no se reutiliza en otra dosis", async ({
  browser,
}) => {
  const f = fixture();
  const context = await browser.newContext();
  const manager = await browser.newContext();
  try {
    const headers = await auth(context, f, "patient");
    const admin = await auth(manager, f, "manager");
    expect(
      (
        await manager.request.put(
          f.gateway + `/api/v1/medications/patients/${f.patientId}/access`,
          { headers: admin, data: { enabled: true } },
        )
      ).status(),
    ).toBe(200);
    const created = await context.request.post(
      f.gateway + "/api/v1/me/medications/treatments",
      {
        headers,
        data: {
          clientRequestId: randomUUID(),
          medicationId: null,
          name: "No-op QA " + randomUUID().slice(0, 8),
          productType: "medication",
          dosage: 1,
          unit: "tableta",
          route: "oral",
          instructions: "QA",
          times: ["00:00", "00:01"],
          timeZone: "America/Bogota",
          startDate: localDate(),
          endDate: null,
        },
      },
    );
    expect(created.status()).toBe(201);
    const treatment = await created.json();
    const workspace = await context.request.get(
      f.gateway + "/api/v1/me/medications",
      { headers },
    );
    const doses = (await workspace.json()).doses.filter(
      (x: { treatmentId: string }) => x.treatmentId === treatment.id,
    );
    expect(doses).toHaveLength(2);
    const event = (dose: (typeof doses)[number], key: string) => ({
      clientRequestId: key,
      status: "taken",
      scheduledAt: dose.scheduledAt,
      expectedRevision: dose.revision,
    });
    const eventUrl = (id: string) =>
      f.gateway + `/api/v1/me/medications/doses/${id}/events`;
    const taken = await context.request.post(eventUrl(doses[0].id), {
      headers,
      data: event(doses[0], randomUUID()),
    });
    expect(taken.status()).toBe(200);
    const updated = await taken.json();
    const noOpKey = randomUUID();
    const noOp = await context.request.post(eventUrl(updated.id), {
      headers,
      data: event(updated, noOpKey),
    });
    expect(noOp.status()).toBe(200);
    expect(
      Number(
        dbValue(
          f,
          `SELECT count(*) FROM app.medication_intake_events WHERE dose_id='${updated.id}'`,
        ),
      ),
    ).toBe(1);
    const collision = await context.request.post(eventUrl(doses[1].id), {
      headers,
      data: event(doses[1], noOpKey),
    });
    expect(
      collision.status(),
      "an accepted no-op key remains bound to its original operation",
    ).toBe(409);
    expect(
      Number(
        dbValue(
          f,
          `SELECT count(*) FROM app.medication_intake_events WHERE dose_id='${doses[1].id}'`,
        ),
      ),
    ).toBe(0);
  } finally {
    await context.close();
    await manager.close();
  }
});

test("pausar y reanudar conserva intervalos y no inventa tomas durante la pausa", async ({
  browser,
}) => {
  const f = fixture();
  const context = await browser.newContext();
  const clock = async (utcNow: string | null) => {
    const r = await context.request.post(f.gateway + "/__qa/clock", {
      data: { utcNow },
    });
    expect(r.status(), "QA clock controls only the isolated API").toBe(200);
  };
  try {
    const headers = await auth(context, f, "manager");
    const base = f.gateway + `/api/v1/medications/patients/${f.patientId}`;
    const day = localDate();
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const resumeDay = next.toISOString().slice(0, 10);
    await clock(`${day}T12:00:00Z`); // 07:00 Bogotá
    const created = await context.request.post(base + "/treatments", {
      headers,
      data: {
        clientRequestId: randomUUID(),
        medicationId: null,
        name: "Intervalos QA " + randomUUID().slice(0, 8),
        productType: "medication",
        dosage: 1,
        unit: "tableta",
        route: "oral",
        instructions: "QA",
        times: ["08:00", "10:00", "12:00", "14:00", "16:00"],
        timeZone: "America/Bogota",
        startDate: day,
        endDate: null,
      },
    });
    expect(created.status()).toBe(201);
    let treatment = await created.json();
    await clock(`${day}T14:00:00Z`); // pausa09:00
    const paused = await context.request.put(
      base + `/treatments/${treatment.id}/status`,
      {
        headers,
        data: { status: "paused", expectedRevision: treatment.revision },
      },
    );
    expect(paused.status()).toBe(200);
    treatment = await paused.json();
    await clock(`${resumeDay}T18:00:00Z`); // reanuda al día siguiente13:00
    const resumed = await context.request.put(
      base + `/treatments/${treatment.id}/status`,
      {
        headers,
        data: { status: "active", expectedRevision: treatment.revision },
      },
    );
    expect(resumed.status()).toBe(200);
    treatment = await resumed.json();
    await clock(`${resumeDay}T20:00:00Z`); // consulta al día siguiente15:00
    const current = await context.request.get(
      base + `?date=${resumeDay}&timeZone=America%2FBogota`,
      { headers },
    );
    expect(current.status()).toBe(200);
    const doses = (await current.json()).doses.filter(
      (x: { treatmentId: string }) => x.treatmentId === treatment.id,
    );
    const atHour = (hour: number) =>
      doses.find(
        (x: { scheduledAt: string }) =>
          new Date(x.scheduledAt).getUTCHours() === hour + 5,
      );
    expect(atHour(14)?.status).toBe("pending");
    for (const hour of [8, 10, 12]) {
      const dose = atHour(hour);
      expect(
        dose?.status,
        `dose at${hour}:00 falls inside the paused interval`,
      ).toBe("cancelled");
      expect(
        (
          await context.request.post(base + `/doses/${dose.id}/events`, {
            headers,
            data: {
              clientRequestId: randomUUID(),
              status: "taken",
              scheduledAt: dose.scheduledAt,
              expectedRevision: dose.revision,
            },
          })
        ).status(),
      ).toBe(409);
      expect(
        Number(
          dbValue(
            f,
            `SELECT count(*) FROM app.medication_intake_events WHERE dose_id='${dose.id}'`,
          ),
        ),
      ).toBe(0);
    }
    const completed = await context.request.put(
      base + `/treatments/${treatment.id}/status`,
      {
        headers,
        data: { status: "completed", expectedRevision: treatment.revision },
      },
    );
    expect(completed.status()).toBe(200);
    treatment = await completed.json();
    expect(
      (
        await context.request.put(base + `/treatments/${treatment.id}/status`, {
          headers,
          data: { status: "active", expectedRevision: treatment.revision },
        })
      ).status(),
    ).toBe(409);
  } finally {
    await clock(null);
    await context.close();
  }
});

test("resumen global respeta paciente, clínica y solo lectura sin persistir datos", async ({
  browser,
}) => {
  const f = fixture();
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser.newContext()),
  );
  try {
    const [manager, reader, foreign, appPatient] = contexts;
    const [mh, rh, fh, ph] = await Promise.all([
      auth(manager, f, "manager"),
      auth(reader, f, "reader"),
      auth(foreign, f, "foreign"),
      auth(appPatient, f, "patient"),
    ]);
    const before = dbValue(
      f,
      "SELECT (SELECT count(*) FROM app.medication_doses)+(SELECT count(*) FROM app.medication_intake_events)+(SELECT count(*) FROM app.medication_dose_operations)",
    );
    const url = f.gateway + "/api/v1/medications/overview";
    const responses = await Promise.all([
      manager.request.get(url, { headers: mh }),
      reader.request.get(url, {
        headers: { ...rh, "X-Clinic-Id": f.clinicId },
      }),
      foreign.request.get(url, {
        headers: { ...fh, "X-Clinic-Id": f.foreignClinicId },
      }),
    ]);
    for (const response of responses) expect(response.status()).toBe(200);
    const [all, own, other] = await Promise.all(responses.map((r) => r.json()));
    expect(all.totalPatients).toBe(2);
    expect(own.totalPatients).toBe(1);
    expect(other.totalPatients).toBe(1);
    expect(all.activeTreatments).toBe(
      own.activeTreatments + other.activeTreatments,
    );
    expect(all.enabledPatients).toBe(
      own.enabledPatients + other.enabledPatients,
    );
    expect(all.activity).toHaveLength(7);
    for (let i = 0; i < 7; i++) {
      expect(all.activity[i].taken).toBe(
        own.activity[i].taken + other.activity[i].taken,
      );
      expect(all.activity[i].omitted).toBe(
        own.activity[i].omitted + other.activity[i].omitted,
      );
    }
    const wrong = await foreign.request.get(url, {
      headers: { ...fh, "X-Clinic-Id": f.clinicId },
    });
    if (wrong.status() === 200) {
      const empty = await wrong.json();
      expect(empty.totalPatients).toBe(0);
      expect(empty.activeTreatments).toBe(0);
      expect(
        empty.activity.every(
          (d: { taken: number; omitted: number }) =>
            d.taken === 0 && d.omitted === 0,
        ),
      ).toBe(true);
    } else expect([403, 404]).toContain(wrong.status());
    expect((await appPatient.request.get(url, { headers: ph })).status()).toBe(
      403,
    );
    expect(
      dbValue(
        f,
        "SELECT (SELECT count(*) FROM app.medication_doses)+(SELECT count(*) FROM app.medication_intake_events)+(SELECT count(*) FROM app.medication_dose_operations)",
      ),
    ).toBe(before);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
