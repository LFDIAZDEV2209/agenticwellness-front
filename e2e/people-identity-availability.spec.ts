import { expect, test, type Page } from "@playwright/test";

const accountId = "22222222-2222-4222-8222-222222222222";
const patientId = "33333333-3333-4333-8333-333333333333";
const employeeId = "44444444-4444-4444-8444-444444444444";
const organizationId = "55555555-5555-4555-8555-555555555555";

async function mockDirectory(page: Page, canView = true) {
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const respond = (json: unknown) => route.fulfill({ json });
    if (path === "/api/auth/refresh")
      return respond({ accessToken: "synthetic-identity-test", expiresIn: 3600 });
    if (path === "/api/auth/me")
      return respond({
        id: "11111111-1111-4111-8111-111111111111",
        firstName: "ERP",
        lastName: "QA",
        roles: ["Admin"],
        permissions: [
          "Users.Create", "Professionals.Create", "Employees.Create", "Patients.Create", "System.AdminSettings",
          ...(canView ? ["Users.View", "Employees.View", "Professionals.View", "Patients.View"] : []),
        ],
      });
    if (path === "/api/auth/me/preferences") return respond({ lang: "es" });
    if (path === "/api/v1/me/context")
      return respond({
        organization: null, clinics: [], isProfessional: false, employeeStatus: "Active",
        onboardingCompleted: true, activeClinicId: null,
      });
    if (path === `/api/auth/users/${accountId}`)
      return respond({
        id: accountId, firstName: "Alicia", lastName: "Invitada",
        email: "invite@example.invalid", isActive: true, roles: [], applications: ["erp"],
        createdAt: "2026-11-19T12:00:00Z",
      });
    if (path === "/api/v1/organizations/tree")
      return respond([{ id: organizationId, name: "Organización QA", clinics: [] }]);
    if (path === "/api/auth/users/email-availability") {
      const exists = url.searchParams.get("email") === "invite@example.invalid";
      return respond({
        exists, isActive: true, hasPassword: false, userId: exists ? accountId : null,
        firstName: exists ? "Alicia" : null, lastName: exists ? "Invitada" : null,
      });
    }
    if (path === "/api/v1/professionals/email-availability") {
      if (url.searchParams.get("email") === "invite@example.invalid")
        return respond({
          available: true,
          employee: null,
          patient: null,
          account: { exists: true, isActive: true, hasPassword: false, userId: accountId, firstName: "Alicia", lastName: "Invitada" },
        });
      if (url.searchParams.get("email") === "staff@example.invalid")
        return respond({
          available: false,
          account: null,
          patient: null,
          employee: { id: employeeId, firstName: "Rafael", lastName: "Profesional", status: "Invited", hasAccount: false },
        });
      return respond({ available: true, account: null, patient: null, employee: null });
    }
    if (path === "/api/v1/patients/identity-availability") {
      if (url.searchParams.get("email") === "invite@example.invalid")
        return respond({ exists: true, owner: { kind: "user", id: accountId, firstName: "Alicia", lastName: "Invitada" } });
      if (url.searchParams.get("documentNumber") === "ABC123456")
        return respond({
          exists: true,
          owner: canView ? { kind: "patient", id: patientId, firstName: "Lina", lastName: "Documento Apellido Muy Largo" } : null,
        });
      return respond({ exists: false, owner: null });
    }
    if (["POST", "DELETE", "PUT", "PATCH"].includes(request.method())) writes.push(path);
    return respond([]);
  });
  return writes;
}

test("cuenta nueva enlaza por nombre la cuenta con invitación", async ({ page }) => {
  const writes = await mockDirectory(page);
  await page.goto("/people/new?mode=user");
  const email = page.getByPlaceholder("ej. usuario@coppaddresd.com");
  await email.fill("INVITE@example.invalid");
  const link = page.getByRole("link", { name: "Alicia Invitada", exact: true });
  await expect(link).toHaveAttribute("href", `/users/${accountId}`);
  await expect(page.getByRole("status").filter({ has: link })).toContainText("En uso por");
  await email.fill("otro@example.invalid");
  await expect(link).toHaveCount(0);
  await email.fill("invite@example.invalid");
  await link.click();
  await expect(page).toHaveURL(`/users/${accountId}`);
  await expect(page.getByRole("heading", { name: "Alicia Invitada" }).first()).toBeVisible();
  expect(writes).toEqual([]);
});

for (const mode of ["professional", "employee"]) {
  test(`alta de ${mode} enlaza al perfil o a la cuenta que usa el correo`, async ({ page }) => {
    const writes = await mockDirectory(page);
    await page.goto(`/people/new?mode=${mode}`);
    const email = page.getByPlaceholder("ej. usuario@coppaddresd.com");
    await email.fill("staff@example.invalid");
    await expect(page.getByRole("link", { name: "Rafael Profesional", exact: true })).toHaveAttribute("href", `/employees/${employeeId}`);
    await expect(page.getByRole("button", { name: "Eliminar perfil", exact: true })).toHaveCount(0);
    await email.fill("invite@example.invalid");
    await expect(page.getByRole("link", { name: "Alicia Invitada", exact: true })).toHaveAttribute("href", `/users/${accountId}`);
    expect(writes).toEqual([]);
  });
}

for (const route of ["/people/new?mode=patient", "/patients/new"]) {
  test(`alta de paciente en ${route} enlaza el correo y el documento exactos`, async ({ page }, info) => {
    const writes = await mockDirectory(page);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(route);
    await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill("invite@example.invalid");
    await page.getByRole("textbox", { name: "Número de documento", exact: true }).fill("ABC123456");
    await expect(page.getByRole("link", { name: "Alicia Invitada", exact: true })).toHaveAttribute("href", `/users/${accountId}`);
    const match = page.getByRole("link", { name: "Lina Documento Apellido Muy Largo", exact: true });
    await expect(match).toHaveAttribute("href", `/patients/${patientId}`);
    await expect(page.getByRole("textbox", { name: "Número de documento", exact: true })).toHaveAttribute("aria-invalid", "true");
    await match.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.screenshot({ path: info.outputPath("identidad-movil.png"), animations: "disabled" });
    expect(writes).toEqual([]);
  });
}

test("muestra un aviso sin datos de un paciente fuera del alcance", async ({ page }) => {
  await mockDirectory(page, false);
  await page.goto("/people/new?mode=patient");
  await page.getByPlaceholder("1234567890").fill("ABC123456");
  await expect(page.getByText("Ya está en uso.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Lina/ })).toHaveCount(0);
});
