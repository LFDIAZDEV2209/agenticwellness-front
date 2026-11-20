import { test, expect, type Page } from "@playwright/test";

const patientId = "11111111-1111-4111-8111-111111111111";
const doseId = "22222222-2222-4222-8222-222222222222";
const treatmentId = "33333333-3333-4333-8333-333333333333";
const allPermissions = [
  "Medications.View",
  "Medications.Manage",
  "Medications.ManageAccess",
];

/** Límite HTTP sintético para UI. No sustituye el E2E entre app, API y PostgreSQL. */
async function mockMedications(
  page: Page,
  options: {
    readOnly?: boolean;
    disabled?: boolean;
    denied?: boolean;
    english?: boolean;
    failOnce?: boolean;
    revokeManageOnCreate?: boolean;
    overviewEmpty?: boolean;
  } = {},
) {
  const permissions = options.denied
    ? []
    : options.readOnly
      ? ["Medications.View"]
      : allPermissions;
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const occurredAt = new Date(Date.now() - 60_000).toISOString();
  const treatment = {
    id: treatmentId,
    medicationId: null,
    name: "Vitamina de prueba",
    productType: "vitamin",
    status: "active",
    origin: "patient_reported",
    revision: 1,
    createdAt: occurredAt,
    dosage: 1,
    unit: "tableta",
    route: "oral",
    instructions: "Con el desayuno",
    times: ["08:00"],
    timeZone: "America/Bogota",
    startDate: "2026-01-01",
    endDate: null,
  };
  const dose = {
    id: doseId,
    treatmentId,
    name: treatment.name,
    dosage: 1,
    unit: "tableta",
    scheduledAt: occurredAt,
    timeZone: "America/Bogota",
    status: "pending",
    occurredAt: null as string | null,
    revision: 0,
  };
  const workspace = {
    patient: {
      id: patientId,
      name: "Alejandra Nombre Largo Apellido de Prueba",
      mrn: "QA-MED-001",
    },
    access: { enabled: false, revision: 0 },
    treatments: [treatment],
    doses: [dose],
    history: [] as unknown[],
    summary: {
      activeTreatments: 1,
      scheduledDoses: 1,
      takenDoses: 0,
      pendingDoses: 1,
    },
  };
  if (options.english)
    await page.context().addCookies([
      {
        name: "copp_lang",
        value: "en",
        url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      },
    ]);
  let fail = options.failOnce;
  let manageRevoked = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/api/auth/refresh")
      return reply({
        accessToken: "synthetic-medications-ui-token",
        expiresIn: 3600,
      });
    if (path === "/api/auth/me")
      return reply({
        id: "44444444-4444-4444-8444-444444444444",
        email: "medications-qa@example.invalid",
        firstName: "QA",
        lastName: "Medicamentos",
        roles: ["Reviewer"],
        permissions,
      });
    if (path === "/api/auth/me/preferences") return reply({});
    if (path === "/api/v1/me/context")
      return reply({
        userId: "44444444-4444-4444-8444-444444444444",
        employeeId: null,
        professionalId: null,
        organization: null,
        isProfessional: false,
        onboardingCompleted: true,
        employeeStatus: "Active",
        clinics: [],
        activeClinicId: null,
      });
    if (path === "/api/v1/medications/overview") {
      const end = new Date();
      const activity = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(end);
        date.setDate(date.getDate() - 6 + i);
        return {
          date: date.toISOString().slice(0, 10),
          taken: options.overviewEmpty ? 0 : i % 2,
          omitted: options.overviewEmpty ? 0 : i === 2 ? 1 : 0,
        };
      });
      return reply({
        totalPatients: 1,
        enabledPatients: workspace.access.enabled ? 1 : 0,
        patientsWithActiveTreatments: options.overviewEmpty ? 0 : 1,
        activeTreatments: options.overviewEmpty ? 0 : 1,
        takenToday: 0,
        periodStart: activity[0].date,
        periodEnd: activity[6].date,
        activity,
      });
    }
    if (path === "/api/v1/me/capabilities")
      return reply({
        policyVersion: "medications-v1:1",
        modules: {
          medications: {
            enabled: !options.disabled,
            canView: !options.disabled && !options.denied,
            canManage: !options.readOnly && !manageRevoked,
            canManageAccess: !options.readOnly,
          },
        },
      });
    if (!path.startsWith("/api/v1/medications/")) return reply({}, 404);
    if (options.denied) return reply({ message: "Sin acceso" }, 403);
    if (options.disabled) return reply({}, 404);
    if (path.endsWith("/patients")) {
      const matches = workspace.patient.name
        .toLowerCase()
        .includes((url.searchParams.get("query") ?? "").toLowerCase());
      return reply({
        items: matches
          ? [
              {
                patientId,
                name: workspace.patient.name,
                mrn: "QA-MED-001",
                enabled: workspace.access.enabled,
                activeTreatments: 1,
              },
            ]
          : [],
        total: matches ? 1 : 0,
        page: 1,
        pageSize: 20,
      });
    }
    if (request.method() === "GET") return reply(workspace);
    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({ path, body });
    if (path.endsWith("/access")) {
      workspace.access = {
        enabled: body.enabled === true,
        revision: workspace.access.revision + 1,
      };
      return reply(workspace.access);
    }
    if (path.endsWith("/events")) {
      if (fail) {
        fail = false;
        return reply({ message: "Fallo temporal" }, 503);
      }
      dose.status = String(body.status);
      dose.occurredAt = occurredAt;
      dose.revision++;
      workspace.summary.takenDoses = dose.status === "taken" ? 1 : 0;
      workspace.summary.pendingDoses = 0;
      workspace.history = [
        {
          id: `event-${dose.revision}`,
          doseId,
          treatmentId,
          name: treatment.name,
          status: dose.status,
          occurredAt,
          recordedAt: occurredAt,
          reason: body.reason ?? null,
          origin: "staff_recorded",
        },
        ...workspace.history,
      ];
      return reply(dose);
    }
    if (path.endsWith("/status")) {
      treatment.status = String(body.status);
      treatment.revision++;
      return reply(treatment);
    }
    if (path.endsWith("/treatments")) {
      if (options.revokeManageOnCreate) {
        manageRevoked = true;
        return reply({ message: "Permiso retirado" }, 403);
      }
      const created = {
        ...treatment,
        ...body,
        id: "55555555-5555-4555-8555-555555555555",
        origin: "staff_recorded",
      };
      workspace.treatments.push(created);
      return reply(created, 201);
    }
    return reply({}, 404);
  });
  return { writes };
}

test("directorio y ficha conectados; habilitación y alta de tratamiento", async ({
  page,
}) => {
  const { writes } = await mockMedications(page);
  await page.goto("/medications");
  await expect(
    page.getByRole("heading", { name: "Control de medicamentos", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Alejandra Nombre Largo/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Alejandra Nombre Largo Apellido de Prueba",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Activar acceso", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Desactivar acceso", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nuevo tratamiento", exact: true })
    .click();
  await page
    .getByLabel("Tipo de producto", { exact: true })
    .selectOption("supplement");
  await page
    .getByLabel("Nombre del producto", { exact: true })
    .fill("Suplemento registrado");
  await page.getByLabel("Cantidad por toma", { exact: true }).fill("2");
  await page.getByLabel("Unidad", { exact: true }).fill("cápsula");
  await page.getByLabel("Horario 1", { exact: true }).fill("08:30");
  await page
    .getByRole("button", { name: "Guardar tratamiento", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Tratamiento registrado" }),
  ).toBeVisible();
  expect(
    writes.some((w) => w.path.endsWith("/access") && w.body.enabled === true),
  ).toBe(true);
  expect(
    writes.some(
      (w) =>
        w.path.endsWith("/treatments") && w.body.productType === "supplement",
    ),
  ).toBe(true);
});

test("nuevo tratamiento abre en el catálogo y guarda el producto seleccionado con teclado", async ({ page }, info) => {
  const { writes } = await mockMedications(page);
  const queries: string[] = [];
  const item = { id: "308136", name: "Amoxicillin 500 MG Oral Capsule" };
  await page.route("**/api/v1/medications/catalog/us?*", async (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("search") ?? "");
    await route.fulfill({ json: [item] });
  });
  await page.goto(`/medications/${patientId}`);
  await page.getByRole("button", { name: "Nuevo tratamiento", exact: true }).click();
  const form = page.getByRole("form", { name: "Nuevo tratamiento" });
  const search = form.getByRole("combobox", { name: "Buscar en catálogo de EE. UU." });
  const submit = form.getByRole("button", { name: "Guardar tratamiento" });
  await expect(search).toBeFocused();
  await expect(form.getByLabel("Nombre del producto", { exact: true })).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await search.fill("amox");
  await expect(page.getByRole("option", { name: item.name })).toBeVisible();
  await page.screenshot({ path: info.outputPath("new-treatment-catalog-light.png") });
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(form.getByText(item.name, { exact: true })).toBeVisible();
  await expect(form.getByLabel("Cantidad por toma")).toHaveValue("");
  await form.getByLabel("Cantidad por toma").fill("1");
  await form.getByLabel("Unidad", { exact: true }).fill("cápsula");
  await form.getByLabel("Vía", { exact: true }).fill("oral");
  await form.getByRole("textbox", { name: "Indicaciones", exact: true }).fill("Indicaciones de prueba");
  await submit.click();
  await expect(page.getByRole("status").filter({ hasText: "Tratamiento registrado" })).toBeVisible();
  expect(queries).toEqual(["amox"]);
  expect(writes.find(({ path }) => path.endsWith("/treatments"))?.body).toMatchObject({
    rxCui: item.id,
    name: item.name,
    dosage: 1,
    unit: "cápsula",
    route: "oral",
    instructions: "Indicaciones de prueba",
  });
});

test("ofrece entrada manual cuando falla el catálogo y conserva el formulario en móvil", async ({ page }, info) => {
  const { writes } = await mockMedications(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/medications/catalog/us?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("search");
    if (query === "local") await route.fulfill({ status: 503, json: {} });
    else await route.fulfill({ json: [] });
  });
  await page.goto(`/medications/${patientId}`);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.getByRole("button", { name: "Nuevo tratamiento", exact: true }).click();
  const form = page.getByRole("form", { name: "Nuevo tratamiento" });
  const search = form.getByRole("combobox", { name: "Buscar en catálogo de EE. UU." });
  await search.fill("sin resultados");
  await expect(page.getByText("Sin coincidencias en RxTerms.")).toBeVisible();
  await search.fill("local");
  await expect(page.getByText("No se pudo buscar. Reintenta.")).toBeVisible();
  await form.getByRole("button", { name: "Entrada manual" }).click();
  const name = form.getByLabel("Nombre del producto", { exact: true });
  await expect(name).toBeFocused();
  await expect(search).toHaveCount(0);
  await form.getByRole("button", { name: "Usar catálogo" }).click();
  await expect(search).toBeFocused();
  await form.getByRole("button", { name: "Entrada manual" }).click();
  await name.fill("Medicamento local QA");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const formBody = form.locator('[data-slot="dialog-body"]');
    expect(await formBody.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    const label = await form.getByText("Tipo de producto", { exact: true }).boundingBox();
    const control = await form.getByRole("combobox", { name: "Tipo de producto" }).boundingBox();
    expect(control!.y - label!.y - label!.height).toBeGreaterThanOrEqual(10);
    await expect(form.getByRole("button", { name: "Guardar tratamiento" })).toBeInViewport();
  }
  await page.screenshot({ path: info.outputPath("new-treatment-manual-mobile-dark.png"), animations: "disabled" });
  await form.getByRole("button", { name: "Guardar tratamiento" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tratamiento registrado" })).toBeVisible();
  const body = writes.find(({ path }) => path.endsWith("/treatments"))?.body;
  expect(body).toMatchObject({ name: "Medicamento local QA", productType: "medication" });
  expect(body).not.toHaveProperty("rxCui");
});

test("registra una toma y conserva la misma operación al reintentar", async ({
  page,
}) => {
  const { writes } = await mockMedications(page, { failOnce: true });
  await page.goto(`/medications/${patientId}`);
  await page
    .getByRole("button", { name: "Registrar toma", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "No se pudo completar la operación" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar toma", exact: true })
    .click();
  await expect(page.getByText("Tomado", { exact: true })).toBeVisible();
  const events = writes.filter((w) => w.path.endsWith("/events"));
  expect(events).toHaveLength(2);
  expect(events[0].body.clientRequestId).toBe(events[1].body.clientRequestId);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(
    page.getByText("Registrado por personal", { exact: true }),
  ).toBeVisible();
});

test("solo lectura permite seguimiento sin acciones clínicas ni habilitación", async ({
  page,
}) => {
  const { writes } = await mockMedications(page, { readOnly: true });
  await page.goto(`/medications/${patientId}`);
  await expect(
    page.getByRole("heading", {
      name: "Alejandra Nombre Largo Apellido de Prueba",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nuevo tratamiento", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Activar acceso", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Registrar toma", exact: true }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("una corrección exige motivo y conserva la revisión del registro", async ({
  page,
}) => {
  const { writes } = await mockMedications(page);
  await page.goto(`/medications/${patientId}`);
  await page
    .getByRole("button", { name: "Registrar toma", exact: true })
    .click();
  await expect(page.getByText("Tomado", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Corregir registro", exact: true })
    .click();
  await page
    .getByLabel("Estado corregido", { exact: true })
    .selectOption("omitted");
  await page
    .getByLabel("Motivo de la corrección", { exact: true })
    .fill("Registro realizado por error");
  await page
    .getByRole("button", { name: "Guardar corrección", exact: true })
    .click();
  await expect(page.getByText("Omitido", { exact: true })).toBeVisible();
  const events = writes.filter((write) => write.path.endsWith("/events"));
  expect(events).toHaveLength(2);
  expect(events[1].body.expectedRevision).toBe(1);
  expect(events[1].body.reason).toBe("Registro realizado por error");
  expect(events[1].body.clientRequestId).not.toBe(
    events[0].body.clientRequestId,
  );
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(
    page.getByText("Registro realizado por error", { exact: true }),
  ).toBeVisible();
});

test("módulo deshabilitado y permisos retirados no exponen la ficha", async ({
  page,
}) => {
  await mockMedications(page, { disabled: true });
  await page.goto(`/medications/${patientId}`);
  await expect(
    page.getByText("Módulo no disponible", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Alejandra Nombre Largo Apellido de Prueba", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Control de medicamentos", exact: true }),
  ).toHaveCount(0);
});

test("sin permiso de lectura una URL directa no expone el paciente", async ({
  page,
}) => {
  const { writes } = await mockMedications(page, { denied: true });
  await page.goto(`/medications/${patientId}`);
  await expect(
    page.getByText("Acceso denegado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Alejandra Nombre Largo Apellido de Prueba", {
      exact: true,
    }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("un permiso de gestión retirado cierra el formulario tras el rechazo", async ({
  page,
}) => {
  const { writes } = await mockMedications(page, {
    revokeManageOnCreate: true,
  });
  await page.goto(`/medications/${patientId}`);
  await page
    .getByRole("button", { name: "Nuevo tratamiento", exact: true })
    .click();
  await page.getByRole("button", { name: "Entrada manual", exact: true }).click();
  await page.getByLabel("Nombre del producto", { exact: true }).fill("Tratamiento rechazado");
  await page
    .getByRole("button", { name: "Guardar tratamiento", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Nuevo tratamiento", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Nombre del producto", { exact: true }),
  ).toHaveCount(0);
  expect(
    writes.filter((write) => write.path.endsWith("/treatments")),
  ).toHaveLength(1);
});

test("responsive, nombres en una línea y traducción inglesa", async ({
  page,
}) => {
  await mockMedications(page, { english: true });
  await page.goto("/medications");
  await expect(
    page.getByRole("heading", { name: "Medication control", exact: true }),
  ).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(
      page.getByRole("link", { name: /Alejandra Nombre Largo/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("link", { name: /Alejandra Nombre Largo/ }).click();
  const name = page.getByRole("heading", {
    name: "Alejandra Nombre Largo Apellido de Prueba",
    exact: true,
  });
  await expect(name).toBeVisible();
  expect(await name.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe(
    "nowrap",
  );
});

test("inicio renovado muestra resumen, actividad y atajos que abren el historial y el alta", async ({
  page,
}, info) => {
  await mockMedications(page);
  await page.goto("/medications");
  await expect(
    page.getByRole("heading", { name: "Actividad semanal", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Resumen de medicamentos", exact: true }),
  ).toContainText("Tratamientos activos");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const accessCard = page.getByRole("region", { name: "El seguimiento también va con ellos.", exact: true });
  await expect(accessCard.locator("img")).toHaveCount(0);
  await expect(accessCard.locator(".medication-home-access-art circle")).toHaveCount(2);
  await accessCard.screenshot({ path: info.outputPath("access-card-light.png") });
  await page.screenshot({ path: info.outputPath("overview-light.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: info.outputPath("overview-dark.png") });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page
    .getByRole("button", { name: "Historial de tomas", exact: true })
    .click();
  await page.getByRole("link", { name: /Alejandra Nombre Largo/ }).click();
  await expect(
    page.getByRole("tab", { name: "Historial", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goto("/medications");
  await page
    .getByRole("button", { name: "Registrar tratamiento", exact: true })
    .click();
  await page.getByRole("link", { name: /Alejandra Nombre Largo/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Buscar en catálogo de EE. UU.", exact: true }),
  ).toBeFocused();
});

test("inicio sin registros no inventa actividad y conserva el diseño en oscuro y móvil", async ({
  page,
}, info) => {
  await mockMedications(page, { overviewEmpty: true });
  await page.goto("/medications");
  await expect(
    page.getByText("Sin registros esta semana", { exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("heading", {
        name: "Control de medicamentos",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`overview-empty-dark-${width}.png`),
    });
  }
});

test("los atajos de frecuencia completan un horario editable y guardan el intervalo", async ({ page }) => {
  const { writes } = await mockMedications(page);
  await page.goto(`/medications/${patientId}`);
  await page.getByRole("button", { name: "Nuevo tratamiento", exact: true }).click();
  const form = page.getByRole("form", { name: "Nuevo tratamiento" });
  const frequency = form.getByLabel("Frecuencia", { exact: true });
  const firstTime = form.getByLabel("Horario 1", { exact: true });
  await form.getByRole("button", { name: "Cada 8 horas", exact: true }).click({ timeout: 5000 });
  await expect(frequency).toHaveValue("interval");
  await expect(firstTime).toHaveValue("06:00");
  await expect(form.getByLabel("Horas entre tomas")).toHaveValue("8");
  await form.getByRole("button", { name: "1 vez al día", exact: true }).click();
  await expect(frequency).toHaveValue("daily");
  await expect(firstTime).toHaveValue("08:00");
  await form.getByRole("button", { name: "Cada 12 horas", exact: true }).click();
  await expect(form.getByLabel("Horas entre tomas")).toHaveValue("12");
  await firstTime.fill("09:00");
  await form.getByRole("button", { name: "Entrada manual", exact: true }).click();
  await form.getByLabel("Nombre del producto", { exact: true }).fill("QA pauta de intervalo");
  await form.getByRole("button", { name: "Guardar tratamiento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "QA pauta de intervalo" })).toBeVisible();
  expect(writes.find(item => item.path.endsWith("/treatments"))?.body).toMatchObject({
    times: ["09:00"],
    intervalHours: 12,
  });
});

test.describe("seguimiento con una zona distinta a Bogotá", () => {
  const zone = "America/Los_Angeles";
  test.use({ timezoneId: zone });

  test("muestra la fecha real de una toma tardía y permite reintentar solo el resumen mensual", async ({ page }) => {
    await mockMedications(page);
    const requests: string[] = [];
    const localIso = new Intl.DateTimeFormat("sv-SE", { timeZone: zone }).format(new Date());
    const nextDay = new Date(localIso + "T16:00:00Z");
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const displayDate = new Intl.DateTimeFormat("es-CO", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(nextDay);
    await page.route("**/api/v1/medications/patients/*/version", route =>
      route.fulfill({ status: 404, json: {} }),
    );
    await page.route("**/api/v1/medications/patients/*/tracking?*", route => {
      const params = new URL(route.request().url()).searchParams;
      requests.push("week:" + params.get("timeZone"));
      return route.fulfill({ json: {
        patient: { id: patientId, name: "Paciente de prueba", mrn: "QA" },
        from: localIso, to: localIso, timeZone: zone, treatments: [],
        days: [{ date: localIso, scheduled: 1, due: 1, taken: 1, omitted: 0, unrecorded: 0, percent: 100 }],
        doses: [{
          localDate: localIso, isRequired: true, timing: "late", delayMinutes: 1440,
          dose: { id: doseId, treatmentId, name: "Vitamina de prueba", status: "taken",
            scheduledAt: localIso + "T16:00:00Z", occurredAt: nextDay.toISOString(), channel: "whatsapp" },
        }],
      } });
    });
    let monthlyAvailable = false;
    await page.route("**/api/v1/medications/patients/*/adherence?*", route => {
      requests.push("adherence:" + new URL(route.request().url()).searchParams.get("timeZone"));
      if (!monthlyAvailable) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: {
        last7Days: { due: 1, taken: 1, percent: 100 },
        last30Days: { due: 4, taken: 3, percent: 75 },
      } });
    });
    await page.goto(`/medications/${patientId}`);
    await page.getByRole("tab", { name: "Semana y día", exact: true }).click();
    const detail = page.getByRole("region", { name: "Detalle del día", exact: true });
    await expect(detail.getByText("WhatsApp", { exact: true })).toBeVisible();
    expect(requests).toEqual(expect.arrayContaining(["week:" + zone, "adherence:" + zone]));
    await expect(detail.getByRole("cell").filter({ hasText: displayDate })).toBeVisible();
    const summary = page.getByRole("group", { name: "Adherencia de 30 días", exact: true });
    await expect(summary.getByText("No se pudo cargar el resumen.", { exact: true })).toBeVisible();
    const weekCallsBeforeRetry = requests.filter(item => item.startsWith("week:")).length;
    monthlyAvailable = true;
    await summary.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect(summary.getByText("75%", { exact: true })).toBeVisible();
    expect(requests.filter(item => item.startsWith("week:"))).toHaveLength(weekCallsBeforeRetry);
  });
});
