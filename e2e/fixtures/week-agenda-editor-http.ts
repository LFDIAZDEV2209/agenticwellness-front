import type { Page } from "@playwright/test";
import {
  mockProfile360Http,
  profilePatientId,
  profileEnrollmentId,
} from "./profile360-http";
import type { EnrollmentWeekResponse } from "../../features/program/types";

export async function mockWeekAgendaEditor(
  page: Page,
  options: { readOnly?: boolean; additionalPermissions?: string[]; english?: boolean } = {},
) {
  const http = await mockProfile360Http(page, {
    permissions: [
      "Patients.View",
      "Program.Profile360View",
      "Program.View",
      "Wellness.View",
      "Media.View",
      ...(options.readOnly ? [] : ["Program.Edit"]),
      ...(options.additionalPermissions ?? []),
    ],
    english: options.english,
  });
  await page.clock.setFixedTime(new Date("2026-11-14T15:00:00Z"));
  const routineA = "00000000-0000-4000-8000-000000000901";
  const routineB = "00000000-0000-4000-8000-000000000902";
  const templateId = "00000000-0000-4000-8000-000000000401";
  const labels = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];
  const weeks = Array.from({ length: 12 }, (_, index) => index + 1);
  const state = {
    writes: [] as { week: number; tasks: Array<Record<string, unknown>> }[],
    fail: false,
    started: false,
    conflict: false,
    hold: false,
    reads: 0,
    contextFails: false,
    failedWeeks: [] as number[],
  };
  const details = new Map<number, EnrollmentWeekResponse>();
  for (const weekNumber of weeks) {
    const start = new Date("2026-11-09T12:00:00Z");
    start.setUTCDate(start.getUTCDate() + (weekNumber - 1) * 7);
    const date = (offset: number) => {
      const next = new Date(start);
      next.setUTCDate(next.getUTCDate() + offset);
      return next.toISOString().slice(0, 10);
    };
    const count = weekNumber === 12 ? 6 : 7;
    details.set(weekNumber, {
      weekNumber,
      weekStartDateLocal: date(0),
      weekEndDateLocal: date(count - 1),
      nutritionPlan: null,
      exerciseRoutine: { id: routineA, name: "Rutina A QA" },
      days: Array.from({ length: count }, (_, index) => ({
        localDate: date(index),
        weekday: index + 1,
        dayLabel: labels[index],
        isPerfectDay: false,
        totalPoints: 0,
        maxPoints: 160,
        bonusAwarded: 0,
        tasks: [
          {
            taskCode: "ejercicio",
            taskLabel: "Rutina",
            scheduledPoints: 80,
            points: 0,
            status: "pending",
            completedAt: null,
            contentRefId: routineA,
            contentName: "Rutina A QA",
            source: "template_week",
          },
          {
            taskCode: "podcast",
            taskLabel: "Podcast",
            scheduledPoints: 80,
            points: 0,
            status: "pending",
            completedAt: null,
            contentRefId: "qa-media",
            contentName: "Podcast QA",
            source: "program",
          },
        ],
      })),
    });
  }
  const reply = (
    route: Parameters<Parameters<Page["route"]>[1]>[0],
    body: unknown,
    status = 200,
  ) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  await page.route(`**/api/v1/program/templates/${templateId}`, (route) =>
    reply(route, {
      id: templateId,
      name: "Programa QA",
      totalWeeks: 12,
      days: labels.flatMap((_, index) => [
        {
          id: `r-${index}`,
          weekday: index + 1,
          taskCode: "ejercicio",
          points: 80,
          sortOrder: 2,
          routineId: routineA,
        },
        {
          id: `p-${index}`,
          weekday: index + 1,
          taskCode: "podcast",
          points: 80,
          sortOrder: 1,
          mediaId: "qa-media",
        },
      ]),
    }),
  );
  await page.route(
    `**/api/v1/program/enrollments/${profileEnrollmentId}`,
    (route) =>
      state.contextFails
        ? reply(route, { detail: "interno" }, 503)
        : route.fallback(),
  );
  await page.route(
    `**/api/v1/program/enrollments/${profileEnrollmentId}/content`,
    (route) =>
      reply(route, {
        enrollmentId: profileEnrollmentId,
        patientId: profilePatientId,
        templateId,
        totalWeeks: 12,
        startLocalDate: "2026-11-09",
        weeks: [...details.values()].map((week) => ({
          weekNumber: week.weekNumber,
          weekStartDateLocal: week.weekStartDateLocal,
          weekEndDateLocal: week.weekEndDateLocal,
          nutritionPlan: week.nutritionPlan,
          exerciseRoutine: week.exerciseRoutine,
        })),
      }),
  );
  await page.route(
    `**/api/v1/program/enrollments/${profileEnrollmentId}/week/**`,
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const week = Number(path.split("/week/")[1].split("/")[0]);
      const detail = details.get(week)!;
      if (route.request().method() === "PUT") {
        const tasks = route.request().postDataJSON() as Array<
          Record<string, unknown>
        >;
        state.writes.push({ week, tasks });
        while (state.hold)
          await new Promise((resolve) => setTimeout(resolve, 20));
        if (state.started)
          return reply(route, { detail: "PROGRAM_WEEK_STARTED" }, 409);
        if (state.fail || state.failedWeeks.includes(week))
          return reply(route, { detail: "interno que no debe mostrarse" }, 503);
        for (const change of tasks) {
          const day = detail.days.find(
            (day) => day.weekday === change.weekday,
          )!;
          const code = String(change.taskCode);
          const task = day.tasks.find((task) => task.taskCode === code);
          if (code === "ejercicio") {
            day.rest = change.rest === true;
            if (day.rest) {
              day.tasks = day.tasks.filter((task) => task.taskCode !== code);
              day.maxPoints = 80;
              continue;
            }
          }
          const id = change.reset
            ? code === "ejercicio"
              ? routineA
              : "qa-media"
            : String(change.routineId ?? change.mediaId);
          const updated = {
            ...task,
            taskCode: code,
            taskLabel: code === "ejercicio" ? "Rutina" : "Podcast",
            scheduledPoints: Number(change.points),
            points: 0,
            status: "pending" as const,
            completedAt: null,
            contentRefId: id,
            contentName:
              code === "ejercicio"
                ? id === routineA
                  ? "Rutina A QA"
                  : "Rutina B QA"
                : "Podcast nuevo QA",
            source: change.reset ? "template_week" : "individual",
          };
          day.tasks = [
            ...day.tasks.filter((task) => task.taskCode !== code),
            updated,
          ];
          day.maxPoints = 160;
        }
        return reply(route, detail);
      }
      state.reads++;
      if (state.conflict && week === 2)
        detail.days[0].tasks[0].contentRefId = routineB;
      return reply(route, detail);
    },
  );
  await page.route("**/api/v1/wellness/exercise-routines?**", (route) =>
    reply(route, {
      data: [
        {
          id: routineA,
          name: "Rutina A QA",
          status: "Active",
          contraindications: null,
        },
        {
          id: routineB,
          name: "Rutina B QA",
          status: "Active",
          contraindications: "Aviso sintético QA antes de asignar.",
        },
      ],
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    }),
  );
  const open = async (week = 2) => {
    await page.goto(`/patients/${profilePatientId}/360`);
    await page.getByRole("tab", { name: /^(Plan semanal|Weekly plan)$/ }).click();
    await page
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", {
          name: new RegExp(`^${week} (Ver tareas|View tasks)$`),
        }),
      })
      .getByRole("button", { name: /^(Ver tareas|View tasks)$/ })
      .click();
    return page.getByRole("dialog", { name: new RegExp(`^(Semana|Week) ${week}$`) });
  };
  return { ...http, state, details, routineA, routineB, open };
}
