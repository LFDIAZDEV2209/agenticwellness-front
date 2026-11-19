import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const erp = "http://127.0.0.1:3160";
const app = "http://127.0.0.1:5189";
const fixturePath = process.env.COP_MEDICATION_COMPLETION_FIXTURE;
test.skip(!fixturePath, "Requires the isolated KAN-75 fixture");

test("ERP edits a prescription, the open app records and corrects it, and ERP updates without reloading", async ({ browser }) => {
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
    await staff.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(treatment).toContainText("23:59");
    await staff.getByRole("tab", { name: "Hoy", exact: true }).click();

    const dose = patient.getByRole("region", { name: "Plan asignado", exact: true })
      .locator(".medications-dose").filter({ hasText: name });
    await expect(dose).toHaveCount(2);
    const due = dose.filter({ hasText: "Atrasada" });
    await due.getByRole("button", { name: "Ya lo tomé", exact: true }).click();
    await expect(due).toHaveCount(0);
    const erpDose = staff.locator(".medication-dose-row").filter({ hasText: name });
    await expect(erpDose.filter({ hasText: "Tomado" })).toHaveCount(1);
    await dose.getByRole("button", { name: "Deshacer toma", exact: true }).click();
    await expect(erpDose.filter({ hasText: "Tomado" })).toHaveCount(0);
  } finally {
    await Promise.all([staff.close(), patient.close()]);
  }
});
