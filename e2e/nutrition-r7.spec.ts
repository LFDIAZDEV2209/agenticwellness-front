import { test, expect } from "@playwright/test";
import { mockIntakeReviewHttp } from "./fixtures/nutrition-review-http";
import { mockCycleReviewHttp } from "./fixtures/nutrition-cycle-review-http";
import { intakePatient, intakeToday } from "./fixtures/nutrition-intake-http";

test.use({ timezoneId: "Asia/Tokyo" });

test("R7-01/02 · agua separada, cantidad visible y comidas en orden clínico", async ({ page }) => {
  const http = await mockIntakeReviewHttp(page, {
    transformDay(day) {
      if (day.localDate === intakeToday) {
        const base = day.records[0];
        day.records.push({ ...base, id: "water", mealCode: "agua", photo: null,
          analysis: null, waterMl: 1800,
          recorded: { calories: null, proteinG: null, carbsG: null, fatG: null, fiberG: null } });
        day.records.push({ ...base, id: "snack", mealCode: "mer" });
        day.records.reverse();
      }
      return day;
    },
  });
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  const meals = page.locator(".nutrition-intake-meals > li");
  await expect(meals).toHaveCount(5);
  await expect(meals.locator("strong")).toHaveText(["Desayuno", "Almuerzo", "Merienda", "Cena", "Agua"]);
  const water = meals.last();
  await expect(water).toContainText("1.800 ml");
  await expect(water).not.toContainText("Sin dato");
  await expect(water).not.toContainText("Fuera del plan");
  await water.getByRole("button").click();
  await expect(page.getByRole("button", { name: "Anclar como ejemplo", exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Fuera del plan", exact: true }).check();
  await expect(meals).toHaveCount(1);
  await expect(meals).toContainText("Cena");
  expect(http.state.writes).toEqual([]);
});

test("R7-03 · hoy vacío se conserva en calendario y se excluye de interrupciones", async ({ page }) => {
  await mockCycleReviewHttp(page, { todayEmpty: true });
  await page.goto(`/nutrition/${intakePatient}?tab=cierre`);
  const summary = page.getByRole("region", { name: "Resumen del período", exact: true });
  await expect(summary).toContainText("2 de 32");
  await expect(summary).toContainText("30 días de interrupción");
  await expect(summary).toContainText("1.350 kcal");
  await page.getByRole("button", { name: "Abrir la bandeja de registros", exact: true }).click();
  const today = page.getByRole("button", { name: /^Día 33 ·/ });
  await expect(today).toHaveAttribute("data-state", "no_data");
  await expect(today).toHaveAccessibleName(/Hoy, en curso/);
});

test("R7-04/05/06 · último registro, contadores, chips y leyenda con anclado", async ({ page }) => {
  const http = await mockIntakeReviewHttp(page, {
    transformDay(day) {
      if (day.localDate === intakeToday) day.records = [];
      return day;
    },
  });
  const last = "2026-11-13";
  http.state.reviews.add(last);
  http.state.highlights.set(`${last}-synthetic-des`, null);
  await page.goto(`/nutrition/${intakePatient}?tab=registros`);
  await expect(page.getByRole("button", { name: /^Día 32 ·/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Día 32 ·/ })).toHaveAccessibleName(/Revisado · Ejemplo anclado/);
  const header = page.getByRole("list", { name: "Resumen de registros cargados", exact: true });
  await expect(header).toContainText("registros sin revisar");
  await expect(header).toContainText("con foto");
  const photo = page.locator(".nutrition-intake-filter-toggle").filter({ hasText: "Con foto" });
  await expect(photo.locator(".nutrition-intake-filter-count")).not.toHaveText("—");
  const legend = page.getByRole("list", { name: "Estados del registro", exact: true });
  await expect(legend).toContainText("Revisado");
  await expect(legend).toContainText("Modificado tras tu revisión");
  await expect(legend).toContainText("Ejemplo anclado");
  await expect(page.locator(".nutrition-intake-meals")).toContainText("En el plan");
  await page.getByRole("button", { name: /^Día 1 ·/ }).click();
  await page.getByRole("button", { name: "Actualizar registros", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Día 1 ·/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Iniciar revisión del ciclo", exact: true })).toBeEnabled();
});
