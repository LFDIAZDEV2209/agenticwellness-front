import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Year365Report } from "../features/program/services/year-365-service";
import { mockProfile360Http, profilePatientId } from "./fixtures/profile360-http";

const year365Route = /\/api\/v1\/program\/erp\/patients\/[^/]+\/year-365(?:\/export\/(?:csv|pdf))?(?:\?.*)?$/;

const january: Year365Report = {
  startDate: "2028-01-30",
  endDate: "2029-01-28",
  today: "2028-01-31",
  month: "2028-01",
  months: ["2028-01", "2028-02"],
  days: [
    { day: 1, date: "2028-01-30", future: false, adherencePercent: 0, weightKg: 73, waistCm: null },
    { day: 2, date: "2028-01-31", future: false, adherencePercent: null, weightKg: null, waistCm: null },
  ],
  summary: {
    recordedDays: 1,
    adherencePercent: 0,
    weight: { date: "2028-01-30", value: 73 },
    waist: null,
    streakDays: 0,
    scheduledPauseDays: null,
    safetyExercisePauseDays: null,
  },
  events: [{ id: "phase-event", day: 2, date: "2028-01-31", kind: "modo" }],
};

test("muestra registros y huecos, filtra por mes y descarga la selección", async ({ page }) => {
  await mockProfile360Http(page, { permissions: ["Patients.View", "Program.Profile360View", "Program.Export"] });
  const requests: URL[] = [];
  const qaConfig = process.env.E2E_YEAR_365_API_CONFIG;
  const live: { baseUrl: string; token: string } | null = qaConfig
    ? JSON.parse(await readFile(qaConfig, "utf8"))
    : null;
  await page.route(year365Route, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (live) {
      const response = await route.fetch({
        url: new URL(url.pathname + url.search, live.baseUrl).toString(),
        headers: { Authorization: `Bearer ${live.token}` },
      });
      return route.fulfill({ response });
    }
    if (url.pathname.endsWith("/csv"))
      return route.fulfill({ contentType: "text/csv", body: "periodo,adherencia\n2028-02,\n" });
    if (url.pathname.endsWith("/pdf"))
      return route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\n" });
    const report: Year365Report = url.searchParams.get("month") === "2028-02"
      ? {
        ...january,
        month: "2028-02",
        days: [{ day: 3, date: "2028-02-01", future: true, adherencePercent: null, weightKg: null, waistCm: null }],
        summary: { ...january.summary, recordedDays: 0, adherencePercent: null, weight: null, streakDays: null },
        events: [],
      }
      : january;
    return route.fulfill({ json: { report } });
  });

  await page.goto(`/patients/${profilePatientId}/360`);
  await page.getByRole("tab", { name: "Año 365" }).focus();
  await page.keyboard.press("Enter");
  const view = page.getByRole("region", { name: "Año 365", exact: true });
  await expect(view.getByText("0 %", { exact: true })).toBeVisible();
  await expect(view.locator('[data-date="2028-01-31"]')).toContainText("Sin registro");
  await expect(view.getByText("Cambio de fase")).toBeVisible();

  const captures = process.env.E2E_YEAR_365_CAPTURE_DIR;
  if (captures) await view.screenshot({ path: `${captures}/year-365-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(view).toBeVisible();
  expect(await view.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  if (captures) await view.screenshot({ path: `${captures}/year-365-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 900 });

  const month = view.getByRole("combobox", { name: "Mes" });
  await month.selectOption("2028-02");
  await expect(view.getByText("Este mes no tiene registros.")).toBeVisible();
  await expect(view.getByText("73 kg")).toHaveCount(0);
  await expect(view.locator('[data-date="2028-02-01"]')).toContainText("Próximo");

  for (const format of ["csv", "pdf"] as const) {
    const download = page.waitForEvent("download");
    await view.getByRole("button", { name: `Descargar ${format.toUpperCase()}` }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`year-365-2028-02.${format}`);
    const content = await readFile(await file.path(), "utf8");
    expect(content).toContain(format === "csv" ? "2028-02" : "%PDF");
    const request = requests.find((url) => url.pathname.endsWith(`/export/${format}`));
    expect(request?.pathname).toContain(profilePatientId);
    expect(request?.searchParams.get("month")).toBe("2028-02");
  }
});

test("muestra el estado sin programa y respeta el permiso de exportación en inglés", async ({ page }) => {
  await mockProfile360Http(page, { english: true });
  let hasProgram = true;
  await page.route(year365Route, (route) => route.fulfill({ json: { report: hasProgram ? january : null } }));
  await page.goto(`/patients/${profilePatientId}/360`);
  await page.getByRole("tab", { name: "Year 365" }).click();
  await expect(page.getByRole("heading", { name: "Monthly summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
  hasProgram = false;
  await page.reload();
  await page.getByRole("tab", { name: "Year 365" }).click();
  await expect(page.getByText("This person does not have a 365-day program yet.")).toBeVisible();
});

test("un rechazo del servidor no presenta datos de otra persona", async ({ page }) => {
  await mockProfile360Http(page);
  await page.route(year365Route, (route) => route.fulfill({ status: 404, json: { detail: "Recurso no encontrado." } }));
  await page.goto(`/patients/${profilePatientId}/360`);
  await page.getByRole("tab", { name: "Año 365" }).click();
  await expect(page.getByRole("region", { name: "Año 365", exact: true }).getByRole("alert"))
    .toContainText("No tienes acceso al historial de esta persona.");
  await expect(page.getByRole("heading", { name: "Resumen mensual" })).toHaveCount(0);
});

test("Actualizar vuelve a consultar el mes abierto después de un registro nuevo", async ({ page }) => {
  await mockProfile360Http(page);
  let latestAdherence: number | null = null;
  await page.route(year365Route, (route) => {
    const requestedMonth = new URL(route.request().url()).searchParams.get("month");
    if (requestedMonth !== "2028-02") return route.fulfill({ json: { report: january } });
    return route.fulfill({ json: { report: {
      ...january,
      month: "2028-02",
      days: [{ day: 3, date: "2028-02-01", future: false, adherencePercent: latestAdherence, weightKg: null, waistCm: null }],
      summary: {
        ...january.summary, recordedDays: latestAdherence === null ? 0 : 1,
        adherencePercent: latestAdherence, weight: null, streakDays: null,
      },
      events: [],
    } satisfies Year365Report } });
  });
  await page.goto(`/patients/${profilePatientId}/360`);
  await page.getByRole("tab", { name: "Año 365" }).click();
  const view = page.getByRole("region", { name: "Año 365", exact: true });
  const month = view.getByRole("combobox", { name: "Mes" });
  await month.selectOption("2028-02");
  await expect(view.getByText("Este mes no tiene registros.")).toBeVisible();

  latestAdherence = 60;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(view.getByText("60 %", { exact: true })).toBeVisible();
  await expect(view.locator('[data-date="2028-02-01"]')).toContainText("Registrado");
  await expect(month).toHaveValue("2028-02");
});

test("el resumen distingue pausas sin dato, cero días y días registrados", async ({ page }) => {
  await mockProfile360Http(page);
  await page.route(year365Route, (route) => {
    const month = new URL(route.request().url()).searchParams.get("month");
    const report = month === "2028-02"
      ? {
        ...january,
        month,
        days: [],
        summary: {
          ...january.summary,
          recordedDays: 0,
          adherencePercent: null,
          weight: null,
          streakDays: null,
          scheduledPauseDays: 0,
          safetyExercisePauseDays: 2,
        },
        events: [],
      } satisfies Year365Report
      : january;
    return route.fulfill({ json: { report } });
  });

  await page.goto(`/patients/${profilePatientId}/360`);
  await page.getByRole("tab", { name: "Año 365" }).click();
  const view = page.getByRole("region", { name: "Año 365", exact: true });
  const scheduled = view.getByText("Pausas programadas (días)", { exact: true }).locator("..").locator("dd");
  const safety = view.getByText("Pausas de ejercicio (días)", { exact: true }).locator("..").locator("dd");
  await expect(scheduled).toHaveText("Sin dato");
  await expect(safety).toHaveText("Sin dato");

  await view.getByRole("combobox", { name: "Mes" }).selectOption("2028-02");
  await expect(scheduled).toHaveText("0");
  await expect(safety).toHaveText("2");
});
