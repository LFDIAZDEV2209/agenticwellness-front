import { expect, test } from "@playwright/test";
import { mockPatientsHttp } from "./fixtures/patients-http";

for (const { width, english } of [
  { width: 1880, english: true },
  { width: 1440, english: false },
  { width: 320, english: false },
  { width: 390, english: false },
  { width: 390, english: true },
]) {
  test(`Perfil 360 visible sin scroll horizontal · ${width}px · ${english ? "EN" : "ES"}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (english) await page.addInitScript(() => localStorage.setItem("copp-theme", "dark"));
    const http = await mockPatientsHttp(page, {
      english,
      permissions: ["Patients.View", "Patients.Update", "Program.Edit", "Program.Profile360View"],
    });
    await page.goto("/patients?tab=estado-clinico");
    const region = page.getByRole("region", { name: english ? "Patient table" : "Tabla de personas", exact: true });
    await expect(region).toBeVisible();
    await region.evaluate(el => { el.scrollIntoView({ block: "start", inline: "nearest" }); el.scrollLeft = 0; });
    const row = region.locator("tbody tr").first();
    const link = row.getByRole("link", { name: new RegExp(`^${english ? "360 Profile" : "Perfil 360"}`) });
    await expect(link).toHaveCount(1);
    await expect(link).toBeInViewport({ ratio: 1 });
    const bounds = await link.boundingBox();
    const viewport = await region.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(viewport!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width);
    expect(bounds!.height).toBeGreaterThanOrEqual(width < 640 ? 44 : 24);
    if (width >= 640) expect(bounds!.height).toBeLessThanOrEqual(32);
    const name = row.getByRole("button", { name: new RegExp(`^${http.rows[0].firstName}`) });
    await expect(name).toHaveAttribute("title", `${http.rows[0].firstName} ${http.rows[0].lastName}`);
    for (const patient of http.rows.slice(0, 10)) {
      const label = region.getByRole("button", { name: new RegExp(`^${patient.firstName}`) }).locator("span").first();
      await expect(label).toHaveCount(1);
      await expect(label).toHaveCSS("white-space", "nowrap");
      expect(await label.evaluate(el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1)).toBe(true);
    }
    if (width >= 640) expect((await row.boundingBox())!.height).toBeLessThanOrEqual(88);
    expect(await region.evaluate(el => el.scrollLeft)).toBe(0);
    await expect(link).toHaveAttribute("href", `/patients/${http.rows[0].patientId}/360`);
    if (process.env.ERP_STYLE_CAPTURE_DIR) await page.screenshot({ path: `${process.env.ERP_STYLE_CAPTURE_DIR}/profile360-${width}-${english ? "en" : "es"}.png` });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/patients/${http.rows[0].patientId}/360$`));
    expect(http.writes).toHaveLength(0);
  });
}

test("filas compactas con selección y nombres en una línea", async ({ page }) => {
  const http = await mockPatientsHttp(page, {
    roles: ["ClinicalDirector"],
    permissions: ["Patients.View", "Patients.Update", "Program.Edit", "Program.Profile360View"],
    english: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("copp-theme", "dark"));
  await page.goto("/patients?tab=estado-clinico");
  const region = page.getByRole("region", { name: "Patient table", exact: true });
  await expect(region.getByRole("checkbox").first()).toBeVisible();
  for (const width of [1880, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await region.evaluate(el => { el.scrollIntoView({ block: "start", inline: "nearest" }); el.scrollLeft = 0; });
    const row = region.locator("tbody tr").first();
    const link = row.getByRole("link", { name: /^360 Profile/ });
    await expect(link).toBeInViewport({ ratio: 1 });
    const name = row.getByRole("button", { name: new RegExp(`^${http.rows[0].firstName}`) }).locator("span").first();
    await expect(name).toHaveCSS("white-space", "nowrap");
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(width >= 640 ? 88 : 104);
    if (process.env.ERP_STYLE_CAPTURE_DIR) {
      await page.screenshot({ path: `${process.env.ERP_STYLE_CAPTURE_DIR}/clinical-rows-${width}.png` });
      if (width === 1880) {
        const box = (await region.boundingBox())!;
        const first = (await row.boundingBox())!;
        await page.screenshot({ path: `${process.env.ERP_STYLE_CAPTURE_DIR}/clinical-rows-detail.png`, clip: { x: box.x, y: first.y, width: 710, height: first.height * 3 } });
      }
    }
  }
  expect(http.writes).toHaveLength(0);
});

test("sin permiso mantiene ficha del paciente y oculta Perfil 360", async ({ page }) => {
  const http = await mockPatientsHttp(page, { permissions: ["Patients.View"] });
  await page.goto("/patients?tab=estado-clinico");
  const region = page.getByRole("region", { name: "Tabla de personas", exact: true });
  await expect(region.locator("tbody tr").first()).toBeVisible();
  await expect(region.getByRole("link", { name: /^Perfil 360/ })).toHaveCount(0);
  await region.locator("tbody tr").first().getByRole("button", { name: new RegExp(`^${http.rows[0].firstName}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${http.rows[0].patientId}$`));
  expect(http.writes).toHaveLength(0);
});
