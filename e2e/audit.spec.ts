import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/** Transporte HTTP sintético: verifica la UI real sin escribir ni consultar datos compartidos. */
async function mockAudit(page: Page, options: { permission?: boolean; unavailable?: boolean; english?: boolean; delay?: number } = {}) {
  const requests: URL[] = [];
  let unavailable = options.unavailable ?? false;
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  if (options.english) await page.context().addCookies([{ name: "copp_lang", value: "en", url: baseUrl }]);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/auth/refresh") return reply({ accessToken: "synthetic-audit-token", expiresIn: 3600 });
    if (url.pathname === "/api/auth/me") return reply({ id: "audit-qa", email: "audit@example.invalid", firstName: "Ana", lastName: "Auditoría", roles: ["Admin"], permissions: options.permission === false ? [] : ["Audit.View"] });
    if (url.pathname === "/api/auth/me/preferences") return reply({ lang: options.english ? "en" : "es", accentColor: null });
    if (url.pathname === "/api/v1/me/context") return reply({ userId: "audit-qa", employeeId: null, professionalId: null, organization: null, isProfessional: false, onboardingCompleted: true, clinics: [], activeClinicId: null });
    if (url.pathname === "/api/v1/audit/activity-log") {
      requests.push(url);
      if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay));
      if (unavailable) return reply({ detail: "Indisponibilidad sintética" }, 503);
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
      const empty = url.searchParams.get("table") === "missing";
      return reply({
        items: empty ? [] : [{ id: `audit-${pageNumber}`, occurredAt: "2026-11-17T15:30:00Z", action: pageNumber === 1 ? "INSERT" : "AdaptationApplied", schemaName: "auth", tableName: "users", recordId: `registro-${pageNumber}`, actorType: "USER", userEmail: "audit@example.invalid", userRole: "Admin", ipAddress: "127.0.0.1", correlationId: "correlacion-qa" }],
        total: empty ? 0 : 21, page: pageNumber, pageSize, totalPages: empty ? 0 : Math.ceil(21 / pageSize),
      });
    }
    return reply([]);
  });
  return { requests, recover: () => { unavailable = false; } };
}

async function capture(page: Page, name: string) {
  const directory = process.env.AUDIT_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: "disabled" });
}

test("auditoría: admin carga la ruta, pagina y aplica filtros inclusivos", async ({ page }) => {
  const api = await mockAudit(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/settings/audit");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Auditoría", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "registro-1", exact: true })).toBeVisible();
  await capture(page, "desktop");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByRole("cell", { name: "AdaptationApplied", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Esquema", exact: true }).selectOption("auth");
  await page.getByLabel("Tabla", { exact: true }).fill("users");
  await page.getByRole("combobox", { name: "Acción", exact: true }).selectOption("UPDATE");
  await page.getByLabel("Actor (correo)", { exact: true }).fill(" AUDIT ");
  await page.getByLabel("Desde", { exact: true }).fill("2026-11-17");
  await page.getByLabel("Hasta", { exact: true }).fill("2026-11-17");
  await page.getByLabel("Registro o correlación", { exact: true }).fill("correlacion");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect.poll(() => api.requests.at(-1)?.searchParams.get("actor")).toBe("AUDIT");
  const query = api.requests.at(-1)!.searchParams;
  expect(Object.fromEntries(query)).toMatchObject({ page: "1", pageSize: "20", schema: "auth", table: "users", action: "UPDATE", search: "correlacion" });
  expect(new Date(query.get("to")!).getTime() - new Date(query.get("from")!).getTime()).toBe(86_399_999);
  await page.getByRole("combobox", { name: "Registros por página", exact: true }).selectOption("50");
  await expect.poll(() => api.requests.at(-1)?.searchParams.get("pageSize")).toBe("50");
  await page.getByLabel("Tabla", { exact: true }).fill("missing");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByText("No hay registros de auditoría para estos filtros.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Siguiente", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  await expect(page.getByRole("cell", { name: "registro-1", exact: true })).toBeVisible();
  expect(api.requests.at(-1)!.searchParams.has("schema")).toBe(false);
  expect(errors).toEqual([]);
});

test("auditoría: no consulta sin Audit.View", async ({ page }) => {
  const api = await mockAudit(page, { permission: false });
  await page.goto("/settings/audit");
  await expect(page.getByRole("main").getByText("Acceso denegado", { exact: true })).toBeVisible();
  expect(api.requests).toHaveLength(0);
});

test("auditoría: skeleton, error y reintento", async ({ page }) => {
  const api = await mockAudit(page, { unavailable: true, delay: 350 });
  await page.goto("/settings/audit");
  await expect(page.getByRole("status", { name: "Cargando auditoría" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("No se pudo cargar la auditoría.");
  api.recover();
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("auditoría: móvil e inglés sin desbordamiento de página", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAudit(page, { english: true });
  await page.goto("/settings/audit");
  await expect(page.getByRole("heading", { name: "Auditing", exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await capture(page, "mobile-en");
  await page.getByRole("region", { name: "Recorded activity", exact: true }).scrollIntoViewIfNeeded();
  await capture(page, "mobile-en-table");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
