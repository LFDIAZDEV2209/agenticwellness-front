import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { User, UserUpdateInput } from "../features/users/types";

const patientId = "b400e335-c8b0-48e5-a703-fe19b4ba4321";
const profileId = "ac22856e-5f5d-4e03-80f8-75f2ab230123";
const createdAt = "2026-11-18T15:30:00Z";
const fixture: (Omit<User, "lastName"> & { lastName: string | null })[] = [
  {
    id: "staff-admin", firstName: "Isabel", lastName: "Naranjo", email: "isabel@example.invalid",
    createdAt, isActive: true, roles: ["Admin"], applications: ["erp", "app"], accountType: "erp",
  },
  {
    id: "staff-legacy", firstName: "Tomás", lastName: "Mejía", email: "tomas@example.invalid",
    createdAt, isActive: true, roles: [], applications: [],
  },
  {
    id: patientId, firstName: "Ángel", lastName: "Rodríguez", email: null, phoneNumber: "+573000012345",
    createdAt, isActive: true, roles: [], applications: ["app"], accountType: "patient",
    patient: { id: profileId, documentNumber: "55551234", status: "Activo" },
  },
  {
    id: "patient-wilma", firstName: "Wilma", lastName: null, email: "wilma@example.invalid",
    createdAt, isActive: false, roles: [], applications: ["app"], accountType: "patient", patient: null,
  },
];

/** Intercepta las llamadas del ERP para ejecutar la suite con una sesión sintética. */
async function mockAccounts(page: Page) {
  const users = fixture.map((user) => ({ ...user }));
  const updates: UserUpdateInput[] = [];
  const requests: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    requests.push(pathname);

    switch (pathname) {
      case "/api/auth/refresh":
        return reply({ accessToken: "synthetic-users-token", expiresIn: 3600 });
      case "/api/auth/me":
        return reply({
          id: "qa-admin", email: "qa-admin@example.invalid", firstName: "Adriana", lastName: "Pruebas",
          roles: ["Admin"],
          permissions: ["System.AdminSettings", "Users.View", "Users.Update", "Users.Delete", "Roles.Assign", "Permissions.Assign"],
        });
      case "/api/auth/me/preferences":
        return reply({ lang: "es", accentColor: null });
      case "/api/v1/me/context":
        return reply({ userId: "qa-admin", employeeId: null, professionalId: null, organization: null, isProfessional: false, onboardingCompleted: true, clinics: [], activeClinicId: null });
      case "/api/auth/users":
        return reply(users);
    }

    if (pathname.startsWith("/api/auth/users/")) {
      const user = users.find((item) => pathname === `/api/auth/users/${item.id}`);
      if (!user) return reply({ message: "Cuenta no encontrada" }, 404);
      if (request.method() === "PUT") {
        const body = request.postDataJSON() as UserUpdateInput;
        updates.push(body);
        Object.assign(user, body);
        return route.fulfill({ status: 204 });
      }
      return reply(user);
    }
    return reply([]);
  });

  return { updates, requests };
}

const errors = new WeakMap<Page, string[]>();

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") messages.push(message.text());
  });
});

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

function segment(page: Page, name: RegExp) {
  return page.getByRole("tablist", { name: "Tipo de cuenta" }).getByRole("tab", { name });
}

async function openPatients(page: Page) {
  await page.goto("/users");
  await segment(page, /^Pacientes/).click();
  await expect(page.getByRole("link", { name: /Ángel Rodríguez/ })).toBeVisible();
}

async function capture(page: Page, name: string) {
  const directory = process.env.USERS_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true, animations: "disabled" });
}

test("abre en Usuarios ERP con conteos globales y conserva las cuentas legadas", async ({ page }) => {
  await mockAccounts(page);
  await page.goto("/users");
  const erp = segment(page, /^Usuarios ERP/);
  await expect(erp).toHaveAttribute("aria-selected", "true");
  await expect(erp).toHaveText(/Usuarios ERP\s*2$/);
  await expect(segment(page, /^Pacientes/)).toHaveText(/Pacientes\s*2$/);
  await expect(segment(page, /^Todas las cuentas/)).toHaveText(/Todas las cuentas\s*4$/);
  const table = page.getByRole("table");
  await expect(table.getByRole("link", { name: /Isabel Naranjo/ })).toBeVisible();
  await expect(table.getByRole("link", { name: /Tomás Mejía/ })).toBeVisible();
  await expect(table.getByText("Sin roles", { exact: true })).toBeVisible();
  await expect(table.getByText("Ángel Rodríguez")).toHaveCount(0);
  await expect(table.getByText("Wilma")).toHaveCount(0);
  await capture(page, "erp-1440");
});

test("Pacientes muestra ambos, documento, acceso y acciones de cuenta", async ({ page }) => {
  await mockAccounts(page);
  await page.goto("/users");
  await page.getByRole("checkbox", { name: "Seleccionar Tomás Mejía" }).check();
  const erp = segment(page, /^Usuarios ERP/);
  await erp.focus();
  await erp.press("ArrowRight");
  await expect(segment(page, /^Pacientes/)).toHaveAttribute("aria-selected", "true");
  const table = page.getByRole("table");
  await expect(table.getByRole("link", { name: /Ángel Rodríguez/ })).toHaveAttribute("href", `/patients/${profileId}`);
  await expect(table.getByRole("link", { name: /Wilma/ })).toHaveAttribute("href", "/users/patient-wilma");
  await expect(table.getByText("ID 55551234")).toBeVisible();
  await expect(table.getByText("App móvil", { exact: true })).toHaveCount(2);
  await expect(table.getByText("Sin correo", { exact: true })).toBeVisible();
  await expect(page.getByText("Todos los roles", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 seleccionados")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Seleccionar Ángel Rodríguez" }).check();
  await expect(page.getByRole("button", { name: "Asignar rol", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desactivar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Acciones de Ángel Rodríguez" }).click();
  await expect(page.getByRole("menuitem", { name: "Ver cuenta", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Abrir ficha", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Editar cuenta", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Gestionar roles|Permisos/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: "Seleccionar Ángel Rodríguez" }).uncheck();
  await capture(page, "pacientes-1440");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Vista tarjetas" }).click();
  await expect(page.getByRole("link", { name: /Ángel Rodríguez/ })).toBeVisible();
  await expect(page.getByText("ID 55551234")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await capture(page, "pacientes-390");
});

test("buscar w filtra sin fallar con correos o apellidos nulos", async ({ page }) => {
  await mockAccounts(page);
  await openPatients(page);
  await page.getByRole("textbox", { name: "Buscar usuarios" }).press("w");
  await expect(page.getByRole("link", { name: /Wilma/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ángel Rodríguez/ })).toHaveCount(0);
});

test("buscar 55551234 encuentra la cuenta por documento", async ({ page }) => {
  await mockAccounts(page);
  await openPatients(page);
  const search = page.getByRole("textbox", { name: "Buscar usuarios" });
  await search.fill("55551234");
  await expect(page.getByRole("link", { name: /Wilma/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ángel Rodríguez/ })).toBeVisible();
  await search.fill("+573000012345");
  await expect(page.getByRole("link", { name: /Wilma/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ángel Rodríguez/ })).toBeVisible();
});

test("el editor de paciente guarda identidad y estado sin asignaciones", async ({ page }) => {
  const api = await mockAccounts(page);
  await page.goto(`/users/${patientId}/editar`);
  await expect(page.getByRole("heading", { name: "Editar cuenta de paciente" })).toBeVisible();
  await expect(page.getByText(/^(Roles|Permisos adicionales)$/)).toHaveCount(0);
  await expect(page.getByLabel("Correo electrónico")).toHaveValue("Sin correo");
  const firstName = page.getByLabel("Nombre", { exact: true });
  await firstName.fill("");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("El nombre es requerido", { exact: true })).toBeVisible();
  await expect(firstName).toBeFocused();
  expect(api.updates).toHaveLength(0);
  await firstName.fill("Ángel David");
  await page.getByRole("switch", { name: "Cuenta activa" }).click();
  await capture(page, "editor-1440");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(new RegExp(`/users/${patientId}$`));
  await expect(page.getByRole("heading", { name: "Ángel David Rodríguez" })).toBeVisible();
  expect(api.updates).toEqual([{ firstName: "Ángel David", lastName: "Rodríguez", isActive: false }]);
  expect(api.requests.filter((path) => /^\/api\/auth\/(roles|permissions)(\/|$)/.test(path))).toEqual([]);
});

test("el detalle enlaza la ficha y omite los roles y permisos del ERP", async ({ page }) => {
  const api = await mockAccounts(page);
  await page.goto(`/users/${patientId}`);
  await expect(page.getByRole("heading", { name: "Detalle de cuenta" })).toBeVisible();
  await expect(page.getByText("Paciente · App móvil", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir ficha del paciente" })).toHaveAttribute("href", `/patients/${profileId}`);
  await expect(page.getByText("55551234", { exact: true })).toBeVisible();
  await expect(page.getByText(/^(Roles asignados|Permisos efectivos)$/)).toHaveCount(0);
  await expect(page.getByText("Esta cuenta solo accede a la app móvil. Los roles y permisos del ERP no se aplican.")).toBeVisible();
  expect(api.requests.filter((path) => /^\/api\/auth\/(roles|permissions)(\/|$)/.test(path))).toEqual([]);
  await capture(page, "detalle-1440");
});
