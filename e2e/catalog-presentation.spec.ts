import { expect, test } from "@playwright/test";
import { mockPlatformStyleHttp } from "./fixtures/platform-style-http";

const specialties = [
  { id: "physical", code: "PHYSICAL_THERAPY", name: "Physical Therapy", es: "Rehabilitación física", en: "Physical rehabilitation" },
  { id: "daily", code: "OCCUPATIONAL_THERAPY", name: "Occupational Therapy", es: "Autonomía en actividades diarias", en: "Independence in daily activities" },
];
const profession = {
  id: "dpt", code: "PHYSICAL_THERAPIST", name: "Physical Therapist (DPT)",
  es: "Fisioterapeuta (DPT)", en: "Physiotherapist (DPT)",
  description: null, isActive: true, validSpecialtyIds: specialties.map(({ id }) => id),
};

for (const lang of ["es", "en"] as const) {
  test(`muestra los rótulos de catálogo en ${lang} y conserva la identidad editable`, async ({ page }) => {
    await mockPlatformStyleHttp(page, { english: lang === "en" });
    await page.route("**/api/v1/professional-types**", (route) =>
      route.fulfill({ json: [profession] }),
    );
    await page.route("**/api/v1/specialties**", (route) =>
      route.fulfill({ json: specialties.map((item) => ({ ...item, category: "Terapia", description: null, isActive: true })) }),
    );
    await page.goto("/employees");

    const catalog = page.locator("section").filter({ has: page.getByText("PHYSICAL_THERAPIST", { exact: true }) });
    for (const item of [profession, ...specialties]) {
      await expect(catalog.getByText(item[lang], { exact: true })).toBeVisible();
    }

    const edit = lang === "en" ? "Edit" : "Editar";
    await catalog.getByRole("button", { name: `${edit} ${profession[lang]}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#catalog-name")).toHaveValue(profession.name);
    await expect(dialog.locator("#catalog-code")).toHaveValue(profession.code);
    await expect(dialog.locator("#catalog-code")).toBeDisabled();
  });
}
