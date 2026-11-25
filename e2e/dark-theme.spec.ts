import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { ACCENT_COLORS } from "../lib/config/accent-colors";
import { mockPatientsHttp } from "./fixtures/patients-http";
import { openDashboard } from "./fixtures/dashboard-http";
import { mockNutritionHttp } from "./fixtures/nutrition-http";
import { mockIntakeHttp, intakePatient } from "./fixtures/nutrition-intake-http";
import { mockPlatformStyleHttp } from "./fixtures/platform-style-http";

// Contraste de los controles reales, incluyendo fondos transparentes compuestos.
async function contrast(locator: Locator, property = "color") {
  return locator.evaluate((element, property) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    function rgba(value: string) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v);
    }
    const layers: number[][] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      layers.unshift(rgba(getComputedStyle(node).backgroundColor));
    }
    let background = [255, 255, 255];
    for (const layer of layers) background = background.map((v, i) => layer[i] * layer[3] + v * (1 - layer[3]));
    const ink = rgba(getComputedStyle(element).getPropertyValue(property));
    const foreground = background.map((v, i) => ink[i] * ink[3] + v * (1 - ink[3]));
    const luminance = (color: number[]) => color.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, property);
}

async function readable(locator: Locator, minimum = 4.5) {
  await expect(locator).toBeVisible();
  await expect.poll(() => contrast(locator), { message: (await locator.textContent())?.trim() }).toBeGreaterThanOrEqual(minimum);
}

async function dark(page: Page, accent = "#023467") {
  await page.addInitScript(({ accent }) => {
    if (!localStorage.getItem("copp-theme")) localStorage.setItem("copp-theme", "dark");
    if (!localStorage.getItem("copp-accent")) localStorage.setItem("copp-accent", accent);
  }, { accent });
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function capture(page: Page, name: string) {
  const dir = process.env.ERP_STYLE_CAPTURE_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, animations: "disabled" });
}

test("dark community selected controls retain readable foregrounds", async ({ page }) => {
  await mockPlatformStyleHttp(page);
  await dark(page);
  await page.goto("/community/moderation");
  await readable(page.getByRole("button", { name: /^Reportes de publicaciones/ }));
  const comments = page.getByRole("button", { name: /^Reportes de comentarios/ });
  await comments.click();
  await readable(comments);
  await page.goto("/community/posts");
  await readable(page.getByRole("button", { name: "Más recientes", exact: true }));
  const likes = page.getByRole("button", { name: "Más likes", exact: true });
  await likes.click();
  await readable(likes);
});

test("dark theme styles browser controls and persists a user toggle", async ({ page }) => {
  await mockPatientsHttp(page);
  await dark(page);
  await page.goto("/patients?tab=estado-clinico");
  await expect(page.getByRole("table")).toBeVisible();
  await capture(page, "patients-dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await page.getByRole("button", { name: "Modo claro", exact: true }).click();
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  // El script inicial solo prepara la primera visita; conservar la elección al recargar.
  await page.reload();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

for (const accent of ACCENT_COLORS) {
  test(`dark actions and links remain readable with ${accent.key} accent`, async ({ page }) => {
    await mockPatientsHttp(page);
    await dark(page, accent.hex);
    await page.goto("/patients?tab=estado-clinico");
    await expect(page.getByRole("table")).toBeVisible();
    await readable(page.getByRole("button", { name: "Nueva persona", exact: true }));
    await page.getByRole("button", { name: "Nueva persona", exact: true }).hover();
    await readable(page.getByRole("button", { name: "Nueva persona", exact: true }));
    const name = page.getByRole("table").locator("tbody tr").first().getByRole("button", { name: /^María/ });
    await name.hover();
    await readable(name.locator("span").first());
    await readable(page.getByRole("button", { name: "Limpiar", exact: true }));
    await page.getByRole("button", { name: "Modo claro", exact: true }).click();
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
    const create = page.getByRole("button", { name: "Nueva persona", exact: true });
    await readable(create);
    await create.hover();
    await readable(create);
  });
}

test("dark clinical badges, menus, confirmation and patient form keep readable text", async ({ page }) => {
  const api = await mockPatientsHttp(page);
  await dark(page);
  await page.goto("/patients?tab=estado-clinico");
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  for (const badge of await table.locator(".spectrum-tag").all()) await readable(badge);
  await readable(table.locator("tbody tr").first().locator("td:visible").nth(1));
  await table.locator("tbody tr").first().getByRole("button", { name: /^Acciones para/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const view = menu.getByRole("menuitem", { name: "Ver ficha", exact: true });
  await view.hover();
  await readable(view);
  await menu.getByRole("menuitem", { name: "Eliminar", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await readable(dialog.getByRole("heading"));
  await readable(dialog.getByRole("button", { name: "Eliminar", exact: true }));
  await capture(page, "patient-dialog-dark");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Nueva persona", exact: true }).click();
  await expect(page).toHaveURL(/\/people\/new\?context=patient$/);
  const form = page.locator("main");
  await readable(form.getByRole("heading", { name: "Identidad del paciente", exact: true }));
  const name = form.getByPlaceholder("Ej. María", { exact: true });
  await name.fill("QA contraste");
  await readable(name);
  await expect(name).toHaveCSS("color-scheme", "dark");
  expect(api.writes).toHaveLength(0);
});

test("dark dashboard chart labels and series keep contrast", async ({ page }) => {
  await dark(page);
  await openDashboard(page);
  const activity = page.getByRole("figure", { name: "Actividad (30 días)", exact: true });
  await readable(activity.locator("figcaption").locator("span").first());
  await capture(page, "dashboard-dark");
  // Resolver los colores contra la superficie real de la gráfica, incluidos extremos del degradado.
  for (const tone of ["sky", "teal", "violet", "amber", "pink", "green", "slate", "rose", "orange"]) {
    for (const suffix of ["chart", "deep"]) {
      const probe = activity.locator(`[data-contrast-probe="${tone}-${suffix}"]`);
      await activity.evaluate((element, token) => {
        const probe = document.createElement("span");
        probe.dataset.contrastProbe = token;
        probe.style.color = `var(--spectrum-${token})`;
        element.append(probe);
      }, `${tone}-${suffix}`);
      expect(await contrast(probe), `${tone}-${suffix} on the chart card`).toBeGreaterThanOrEqual(3);
    }
  }
});

test("dark nutrition meal editor keeps text, quantities and native controls readable", async ({ page }) => {
  const api = await mockNutritionHttp(page);
  await dark(page);
  await page.goto("/nutrition/demo-patient-2?tab=plan");
  const grams = page.getByLabel("Gramos de Avena demo", { exact: true });
  await expect(grams).toBeVisible();
  await readable(grams);
  expect(await contrast(grams, "border-top-color")).toBeGreaterThanOrEqual(3);
  await expect(grams).toHaveCSS("color-scheme", "dark");
  await readable(page.locator(".nutrition-meal:visible").getByRole("heading"));
  await capture(page, "nutrition-dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "nutrition-dark-mobile");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(api.writes).toHaveLength(0);
});


test("nutrition intake states use dark surfaces and retain their meaning", async ({ page }) => {
  const api = await mockIntakeHttp(page);
  await dark(page);
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  const strip = page.getByRole("list", { name: "30 días del ciclo", exact: true });
  await expect(strip).toBeVisible();
  for (const state of ["complete", "partial", "no_data", "unplanned"]) {
    const day = strip.locator(`[data-state="${state}"]`).first();
    if (await day.count()) await readable(day);
  }
  await capture(page, "nutrition-intake-dark");
  expect(api.writes).toHaveLength(0);
});

test("accent selection survives theme switches and reload", async ({ page }) => {
  const api = await mockPatientsHttp(page);
  await dark(page);
  await page.goto("/settings");
  const color = page.getByRole("button", { name: "Teal", exact: true });
  await color.click();
  await expect(color).toHaveAttribute("aria-pressed", "true");
  for (const label of ["Modo claro", "Modo oscuro"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(color).toHaveAttribute("aria-pressed", "true");
  }
  await page.reload();
  await expect(color).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  expect(api.writes.every(write => write.path === "/api/auth/me/preferences")).toBe(true);
});
