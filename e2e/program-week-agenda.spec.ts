import { expect, test, type Page } from "@playwright/test";
import {
  mockProfile360Http,
  profilePatientId,
  profileEnrollmentId,
} from "./fixtures/profile360-http";
import type {
  EnrollmentWeekDay,
  EnrollmentWeekTask,
} from "../features/program/types";

async function fixture(page: Page, english = false) {
  const http = await mockProfile360Http(page, { english });
  const labels = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];
  const state = {
    failed: false,
    denied: false,
    empty: false,
    lastWeek: false,
    hold: false,
  };
  const days: EnrollmentWeekDay[] = labels.map((dayLabel, index) => {
    const task = (
      code: string,
      source?: string | null,
    ): EnrollmentWeekTask => ({
      taskCode: code,
      taskLabel: code === "ejercicio" ? "Rutina de ejercicio" : "Podcast",
      source,
      contentRefId: `qa-${code}-${index}`,
      contentName: `${code === "ejercicio" ? "Rutina" : "Episodio"} ${index + 1} QA`,
      points: index === 0 ? 80 : 0,
      scheduledPoints: 80,
      status: index === 0 ? "completed" : "pending",
      completedAt: null,
    });
    return {
      localDate: `2026-11-${String(9 + index).padStart(2, "0")}`,
      weekday: index + 1,
      dayLabel,
      rest: index === 3 ? true : undefined,
      isPerfectDay: false,
      totalPoints: index === 0 ? 160 : 0,
      maxPoints: index === 3 ? 80 : 160,
      bonusAwarded: 0,
      tasks: [
        ...(index === 3
          ? []
          : [
              index === 4
                ? {
                    ...task("ejercicio", "missing"),
                    contentRefId: null,
                    contentName: null,
                  }
                : task(
                    "ejercicio",
                    [
                      "template_generic",
                      "snapshot",
                      "legacy",
                      "rest",
                      "missing",
                      null,
                      "template_week",
                    ][index],
                  ),
            ]),
        task("podcast", index === 1 ? "individual" : "snapshot"),
      ],
    };
  });
  await page.route(`**/api/v1/program/enrollments/${profileEnrollmentId}/content`, route => state.lastWeek ? route.fulfill({ contentType: "application/json", body: JSON.stringify({ enrollmentId: profileEnrollmentId, patientId: profilePatientId, templateId: "qa-template", totalWeeks: 12, startLocalDate: "2026-11-09", weeks: [{ weekNumber: 12, weekStartDateLocal: "2027-01-25", weekEndDateLocal: "2027-01-30", nutritionPlan: null, exerciseRoutine: null }] }) }) : route.fallback());
  await page.route(
    `**/api/v1/program/enrollments/${profileEnrollmentId}/week/*`,
    async (route) => {
      while (state.hold)
        await new Promise((resolve) => setTimeout(resolve, 20));
      const visibleDays = state.lastWeek ? days.slice(0, 6).map((day, index) => ({ ...day, localDate: `2027-01-${25 + index}` })) : days;
      return route.fulfill({
        status: state.denied ? 404 : state.failed ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          state.failed || state.denied
            ? { detail: "Error interno que no debe exponerse" }
            : {
                weekNumber: state.lastWeek ? 12 : 1,
                weekStartDateLocal: visibleDays[0].localDate,
                weekEndDateLocal: visibleDays.at(-1)!.localDate,
                nutritionPlan: null,
                exerciseRoutine: null,
                days: state.empty ? [] : visibleDays,
              },
        ),
      });
    },
  );
  const open = async () => {
    await page.goto(`/patients/${profilePatientId}/360`);
    await page
      .getByRole("tab", {
        name: english ? "Weekly plan" : "Plan semanal",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: english ? "View tasks" : "Ver tareas",
        exact: true,
      })
      .click();
    return page.getByRole("dialog", {
      name: english ? `Week ${state.lastWeek ? 12 : 1}` : `Semana ${state.lastWeek ? 12 : 1}`,
      exact: true,
    });
  };
  return { ...http, state, days, open };
}

test("2.17 · siete días con contenido y origen real, sin controles de escritura", async ({
  page,
}, info) => {
  const http = await fixture(page);
  const dialog = await http.open();
  await expect(dialog.getByRole("article")).toHaveCount(7);
  const monday = dialog.getByRole("article", {
    name: "Lunes · 2026-11-09",
    exact: true,
  });
  await expect(
    monday.getByRole("region", { name: "Rutina", exact: true }),
  ).toContainText("Del programa");
  const tuesday = dialog.getByRole("article", {
    name: "Martes · 2026-11-10",
    exact: true,
  });
  await expect(
    tuesday.getByRole("region", { name: "Rutina", exact: true }),
  ).toContainText("De la semana");
  await expect(
    tuesday.getByRole("region", { name: "Podcast", exact: true }),
  ).toContainText("Personalizado");
  await expect(
    dialog.getByRole("article", { name: "Miércoles · 2026-11-11" }),
  ).toContainText("Asignación anterior");
  const rest = dialog.getByRole("article", { name: "Jueves · 2026-11-12" });
  await expect(rest).toContainText("Descanso");
  await expect(rest).toContainText("Sin misión de ejercicio");
  await expect(rest).toContainText("0/80 XP");
  await expect(
    dialog.getByRole("article", { name: "Viernes · 2026-11-13" }),
  ).toContainText("Sin rutina");
  await expect(
    dialog.getByRole("article", { name: "Sábado · 2026-11-14" }),
  ).toContainText("Origen no informado");
  await expect(
    dialog.getByRole("button", { name: /Editar|Guardar|Copiar/ }),
  ).toHaveCount(0);
  const columns = await dialog
    .locator('[aria-label="Agenda semanal"]')
    .evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length,
    );
  expect(columns).toBe(7);
  await page.screenshot({ path: info.outputPath("agenda-desktop.png") });
  expect(http.program.writes).toEqual([]);
});

test("2.17 · carga, fallo recuperable y ausencia de datos no se confunden con huecos", async ({
  page,
}) => {
  const http = await fixture(page);
  http.state.failed = true;
  const dialog = await http.open();
  await expect(dialog.getByRole("alert")).toContainText(
    "No pudimos cargar la agenda",
  );
  await expect(dialog).not.toContainText("Error interno");
  await expect(dialog.getByRole("article")).toHaveCount(0);
  http.state.failed = false;
  http.state.hold = true;
  try {
    await dialog
      .getByRole("button", { name: "Reintentar", exact: true })
      .click();
    await expect(
      dialog.getByRole("status", { name: "Cargando agenda" }),
    ).toBeVisible();
  } finally {
    http.state.hold = false;
  }
  await expect(dialog.getByRole("article")).toHaveCount(7);
  await dialog.locator('[data-slot="dialog-footer"]').getByRole("button", { name: "Cerrar", exact: true }).click();
  http.state.empty = true;
  await page.getByRole("button", { name: "Ver tareas", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Sin tareas configuradas",
  );
});

test("2.17 · denegación no filtra contenido ni error interno", async ({
  page,
}) => {
  const http = await fixture(page);
  http.state.denied = true;
  const dialog = await http.open();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog).not.toContainText("Rutina 1 QA");
  await expect(dialog).not.toContainText("Error interno");
  expect(http.program.writes).toEqual([]);
});

test("2.17 · móvil inglés, fechas locales y seis días sin fabricar el día 84", async ({
  page,
}, info) => {
  const http = await fixture(page, true);
  http.state.lastWeek = true;
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await http.open();
  await expect(dialog.getByRole("article")).toHaveCount(6);
  await expect(dialog.locator('time[datetime="2027-01-30"]')).toBeVisible();
  await expect(dialog.locator('time[datetime="2027-01-31"]')).toHaveCount(0);
  await expect(dialog).toContainText("Read-only agenda");
  await expect(dialog).toContainText("Custom");
  await expect(dialog).toContainText("Previous assignment");
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("agenda-mobile-en.png") });
  await dialog.locator('[data-slot="dialog-footer"]').getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  expect(http.program.writes).toEqual([]);
});
