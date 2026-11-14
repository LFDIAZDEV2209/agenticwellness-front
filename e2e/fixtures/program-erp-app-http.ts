import type { Browser, Page, Route } from "@playwright/test";
import type { ExerciseRoutine } from "../../features/wellness/types";
import type {
  EnrollmentWeekResponse,
  ProgramEnrollment,
} from "../../features/program/types";
import {
  mockProfile360Http,
  profileEnrollmentId,
  profileOverview,
  profilePatientId,
} from "./profile360-http";

export const erpAppOrigin =
  process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5184";
const templateId = "00000000-0000-4000-8000-000000000401";
const routineId = (suffix: string) =>
  `00000000-0000-4000-8000-0000000009${suffix}`;
const labels = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const start = "2026-11-09";
const addDays = (date: string, offset: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400_000)
    .toISOString()
    .slice(0, 10);
type Decision = {
  routineId: string | null;
  rest: boolean;
  origin: "program" | "individual";
};
/** Shape JSON camelCase de CompletedExerciseDetail (back cbaed6e), no URL firmada. */
interface HistoricalSession {
  routineId: string;
  name: string;
  capturedAt: string;
  exercises: {
    name: string;
    sets: number | null;
    reps: number | null;
    mediaRef: string | null;
    description: string | null;
    durationSecs: number | null;
    restSeconds: number | null;
    targetMuscle: string | null;
    equipment: string | null;
    tips: string | null;
    sortOrder: number;
    weightKg: number | null;
    tempo: string | null;
    rpe: number | null;
  }[];
}

/** Un almacén HTTP por test. No importa resolvedores ni código del backend. */
export async function mockProgramErpApp(erp: Page, browser: Browser) {
  await mockProfile360Http(erp, {
    permissions: [
      "Patients.View",
      "Program.Profile360View",
      "Program.View",
      "Program.Edit",
      "Wellness.View",
      "Wellness.Manage",
      "Media.View",
    ],
  });
  const appContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-CO",
    timezoneId: "America/Bogota",
    serviceWorkers: "block",
  });
  const app = await appContext.newPage();
  const state = {
    date: "2026-11-14",
    activeWeek: 1,
    programRoutine: routineId("01"),
    edits: new Map<string, Decision>(),
    activated: new Map<string, Decision>(),
    sessions: new Map<string, HistoricalSession>(),
    writes: [] as {
      client: "erp" | "app";
      method: string;
      path: string;
      body: unknown;
    }[],
    snapshots: [] as { client: "erp" | "app"; date: string }[],
    unexpected: [] as string[],
    pageErrors: [] as string[],
  };
  const routines = new Map<string, ExerciseRoutine>(
    ["01", "02", "03"].map((suffix, index) => {
      const id = routineId(suffix);
      return [
        id,
        {
          id,
          name: [
            "Movilidad base QA",
            "Fuerza personalizada QA",
            "Equilibrio personalizado QA",
          ][index],
          description: "Indicación sintética",
          difficulty: "Facil",
          category: "Cardio",
          status: "Active",
          estimatedMinutes: 5,
          contraindications: null,
          targetMuscles: null,
          equipment: null,
          warmupNotes: null,
          cooldownNotes: null,
          mediaId: null,
          createdAt: "2026-11-09",
          updatedAt: null,
          createdBy: null,
          exercises: [
            {
              id: `exercise-${suffix}`,
              name: [
                "Movimiento original QA",
                "Sentadilla personalizada QA",
                "Equilibrio de pie QA",
              ][index],
              description: "Controla el movimiento",
              sets: 3,
              repetitions: 12,
              durationSecs: 30,
              restSeconds: 15,
              targetMuscle: null,
              equipment: null,
              tips: "Técnica original QA",
              sortOrder: 0,
              mediaId: null,
              weightKg: null,
              tempo: "2-1-2",
              rpe: 4,
            },
          ],
        },
      ];
    }),
  );
  const weekOf = (date: string) =>
    Math.floor((Date.parse(date) - Date.parse(start)) / 604800_000) + 1;
  const decision = (date: string): Decision =>
    state.activated.get(date) ??
    state.edits.get(date) ?? {
      routineId: state.programRoutine,
      rest: false,
      origin: "program",
    };
  // Descanso previamente devuelto por el backend: la lectura no abre el interruptor 2.7.
  state.edits.set("2026-11-18", {
    routineId: null,
    rest: true,
    origin: "individual",
  });
  const enrollment = (): ProgramEnrollment => ({
    id: profileEnrollmentId,
    patientId: profilePatientId,
    templateId,
    timezone: "America/Bogota",
    status: "Active",
    startedAt: `${start}T05:00:00Z`,
    startLocalDate: start,
    currentWeekNumber: state.activeWeek,
    totalWeeks: 12,
    xpBalance: state.sessions.size * 80,
    streakCurrent: 0,
    streakLongest: 0,
    freezesRemaining: 0,
    completedAt: null,
    pausedAt: null,
    withdrawnAt: null,
    createdAt: `${start}T05:00:00Z`,
  });
  const weekDetail = (week: number): EnrollmentWeekResponse => {
    const weekStart = addDays(start, (week - 1) * 7);
    return {
      weekNumber: week,
      weekStartDateLocal: weekStart,
      weekEndDateLocal: addDays(weekStart, 6),
      nutritionPlan: null,
      exerciseRoutine: null,
      days: labels.map((dayLabel, index) => {
        const date = addDays(weekStart, index),
          picked = decision(date),
          session = state.sessions.get(date);
        const routine = routines.get(picked.routineId ?? "");
        return {
          localDate: date,
          weekday: index + 1,
          dayLabel,
          rest: picked.rest || undefined,
          isPerfectDay: false,
          totalPoints: session ? 80 : 0,
          maxPoints: picked.rest ? 130 : 210,
          bonusAwarded: 0,
          tasks: [
            ...(!picked.rest
              ? [
                  {
                    taskCode: "ejercicio",
                    taskLabel: "Rutina",
                    points: session ? 80 : 0,
                    scheduledPoints: 80,
                    status: session
                      ? ("completed" as const)
                      : ("pending" as const),
                    completedAt: session?.capturedAt ?? null,
                    contentRefId: session?.routineId ?? picked.routineId,
                    contentName: session?.name ?? routine?.name,
                    source: session
                      ? "completion"
                      : picked.origin === "individual"
                        ? "snapshot"
                        : "template_week",
                    detailSnapshot: session ?? null,
                  },
                ]
              : []),
            {
              taskCode: "podcast",
              taskLabel: "Podcast",
              points: 0,
              scheduledPoints: 80,
              status: "pending" as const,
              completedAt: null,
              contentRefId: "00000000-0000-4000-8000-000000000950",
              contentName: "Podcast QA",
              source: "program",
            },
          ],
        };
      }),
    };
  };
  const snapshot = (client: "erp" | "app") => {
    state.snapshots.push({ client, date: state.date });
    const picked = decision(state.date),
      session = state.sessions.get(state.date),
      routine = routines.get(picked.routineId ?? "");
    const exercises = session
      ? session.exercises.map((item) => ({
          ...item,
          repetitions: item.reps,
          mediaId: item.mediaRef,
          mediaUrl: null,
        }))
      : routine?.exercises;
    return {
      enrollmentId: profileEnrollmentId,
      todayLocalDate: state.date,
      rest: picked.rest || undefined,
      template: {
        id: templateId,
        code: "QA-83",
        name: "Programa QA",
        totalWeeks: 12,
        currentWeekNumber: state.activeWeek,
        currentWeekStatus: "Active",
        currentWeekStartDateLocal: addDays(start, (state.activeWeek - 1) * 7),
        currentWeekEndDateLocal: addDays(start, state.activeWeek * 7 - 1),
        streakMinTasks: 1,
        essentialTaskCodes: [],
      },
      todayTasks: [
        {
          taskCode: "podcast",
          title: "Podcast",
          short: "Podcast QA",
          points: 80,
          status: "Pending",
          completedAt: null,
          content: { title: "Podcast QA" },
        },
        ...(!picked.rest
          ? [
              {
                taskCode: "ejercicio",
                title: "Ejercicio",
                short: "Tu rutina",
                points: 80,
                status: session ? "Completed" : "Pending",
                completedAt: session?.capturedAt ?? null,
                content: {
                  title: session?.name ?? routine?.name,
                  exerciseRoutineId: session?.routineId ?? picked.routineId,
                  exerciseRoutineName: session?.name ?? routine?.name,
                  exercises,
                },
              },
            ]
          : []),
      ],
      todayPoints: session ? 80 : 0,
      todayPointsMax: picked.rest ? 130 : 210,
      todayBonusAvailable: true,
      dailyBonusAmount: 50,
      xp: {
        balance: state.sessions.size * 80,
        level: "Semilla",
        nextLevelAt: 2000,
      },
      streak: {
        current: 0,
        longest: 0,
        freezesRemaining: 0,
        multiplierActive: 0,
        multiplierEndsAt: null,
        multiplierRemainingHours: 0,
        nbWeekDays: [],
      },
      nextMilestoneDays: 3,
      calendar: [],
      streakChests: [],
      upcoming: Array.from({ length: 6 }, (_, index) => {
        const date = addDays(state.date, index + 1),
          future = decision(date);
        return {
          date,
          day:
            Math.round((Date.parse(date) - Date.parse(start)) / 86400_000) + 1,
          weekNumber: weekOf(date),
          rest: future.rest || undefined,
          missions: [
            {
              type: "podcast",
              title: "Podcast QA",
              mediaId: "00000000-0000-4000-8000-000000000950",
              contentUnavailable: false,
            },
            ...(!future.rest
              ? [
                  {
                    type: "ejercicio",
                    title: routines.get(future.routineId!)!.name,
                    routineId: future.routineId,
                    contentUnavailable: false,
                  },
                ]
              : []),
          ],
        };
      }),
    };
  };
  const reply = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  const record = (client: "erp" | "app", route: Route) => {
    const req = route.request();
    state.writes.push({
      client,
      method: req.method(),
      path: new URL(req.url()).pathname,
      body: req.postDataJSON(),
    });
  };
  await erp.route("**/api/v1/program/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const weekMatch = path.match(/\/week\/(\d+)(\/tasks)?$/);
    if (weekMatch) {
      const week = Number(weekMatch[1]);
      if (req.method() === "PUT") {
        record("erp", route);
        if (
          addDays(start, (week - 1) * 7) < state.date ||
          week <= state.activeWeek
        )
          return reply(route, { detail: "PROGRAM_WEEK_STARTED" }, 409);
        for (const row of req.postDataJSON() as {
          weekday: number;
          taskCode: string;
          routineId?: string;
          rest?: boolean;
          reset?: boolean;
        }[]) {
          if (row.taskCode !== "ejercicio") {
            state.unexpected.push("ERP escribió otra clase");
            return reply(route, {}, 422);
          }
          state.edits.set(
            addDays(start, (week - 1) * 7 + row.weekday - 1),
            row.reset
              ? {
                  routineId: state.programRoutine,
                  rest: false,
                  origin: "program",
                }
              : {
                  routineId: row.rest ? null : row.routineId!,
                  rest: !!row.rest,
                  origin: "individual",
                },
          );
        }
      }
      return reply(route, weekDetail(week));
    }
    if (path.endsWith(`/enrollments/${profileEnrollmentId}/snapshot`))
      return reply(route, snapshot("erp"));
    if (path.endsWith(`/enrollments/${profileEnrollmentId}/content`))
      return reply(route, {
        enrollmentId: profileEnrollmentId,
        patientId: profilePatientId,
        templateId,
        totalWeeks: 12,
        startLocalDate: start,
        weeks: [1, 2].map((week) => {
          const data = weekDetail(week);
          return {
            weekNumber: week,
            weekStartDateLocal: data.weekStartDateLocal,
            weekEndDateLocal: data.weekEndDateLocal,
            exerciseRoutine: null,
            nutritionPlan: null,
          };
        }),
      });
    if (path.endsWith(`/enrollments/${profileEnrollmentId}`))
      return reply(route, enrollment());
    if (path.endsWith(`/templates/${templateId}`))
      return reply(route, {
        id: templateId,
        name: "Programa QA",
        totalWeeks: 12,
        status: "Active",
        days: labels.map((_, index) => ({
          id: `d-${index}`,
          weekday: index + 1,
          taskCode: "ejercicio",
          points: 80,
          sortOrder: 1,
          routineId: state.programRoutine,
        })),
      });
    if (path.endsWith(`/erp/patients/${profilePatientId}/overview`))
      return reply(route, {
        ...profileOverview,
        enrollment: {
          ...profileOverview.enrollment,
          current_week: state.activeWeek,
        },
      });
    return route.fallback();
  });
  await erp.route("**/api/v1/wellness/**", (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      id = url.pathname.split("/").at(-1)!;
    if (url.pathname.includes("exercise-routines")) {
      if (req.method() === "PUT") {
        record("erp", route);
        const updated = {
          ...routines.get(id)!,
          ...req.postDataJSON(),
        } as ExerciseRoutine;
        routines.set(id, updated);
        return reply(route, updated);
      }
      if (routines.has(id)) return reply(route, routines.get(id));
      return reply(route, {
        data: [...routines.values()],
        page: 1,
        pageSize: 100,
        total: routines.size,
        totalPages: 1,
      });
    }
    return reply(route, {
      data: [],
      page: 1,
      pageSize: 100,
      total: 0,
      totalPages: 1,
    });
  });
  const token = `synthetic.${Buffer.from(JSON.stringify({ sub: profilePatientId, exp: 2_000_000_000 })).toString("base64url")}.signature`;
  await appContext.route("**/api/**", (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path === "/api/auth/refresh")
      return reply(route, { accessToken: token, expiresIn: 3600 });
    if (path === "/api/auth/me")
      return reply(route, {
        id: profilePatientId,
        firstName: "Paciente",
        lastName: "QA",
        roles: ["Patient"],
        permissions: [],
      });
    if (path === "/api/v1/me/patient-profile")
      return reply(route, {
        patientId: profilePatientId,
        firstName: "Paciente",
        lastName: "QA",
        documentNumber: "QA",
        email: "qa@example.invalid",
        phone: "+12025550101",
      });
    if (path === "/api/v1/me/context" || path === "/api/v1/telemedicine/me")
      return reply(route, {
        patient: { id: profilePatientId, organizationId: templateId },
        clinics: [],
      });
    if (path === "/api/v1/program/me/snapshot")
      return reply(route, snapshot("app"));
    if (path === "/api/v1/program/tasks/complete") {
      record("app", route);
      const input = req.postDataJSON();
      if (
        input.enrollmentId !== profileEnrollmentId ||
        input.localDate !== state.date ||
        input.taskCode !== "ejercicio" ||
        decision(state.date).rest
      )
        return reply(route, { detail: "Tarea no permitida" }, 422);
      const routine = routines.get(decision(state.date).routineId!)!;
      if (!state.sessions.has(state.date))
        state.sessions.set(state.date, {
          routineId: routine.id,
          name: routine.name,
          capturedAt: `${state.date}T15:00:00+00:00`,
          exercises: routine.exercises.map((item) => ({
            name: item.name,
            sets: item.sets,
            reps: item.repetitions,
            mediaRef: item.mediaId,
            description: item.description,
            durationSecs: item.durationSecs,
            restSeconds: item.restSeconds,
            targetMuscle: item.targetMuscle,
            equipment: item.equipment,
            tips: item.tips,
            sortOrder: item.sortOrder,
            weightKg: item.weightKg,
            tempo: item.tempo,
            rpe: item.rpe,
          })),
        });
      return reply(route, {
        taskCompletionId: routineId("99"),
        pointsAwarded: 80,
        xpBalanceAfter: state.sessions.size * 80,
        isPerfectDay: false,
        dailyBonusAwarded: 0,
        streakCurrent: 0,
        freezesRemaining: 0,
        dayPoints: 80,
        dayPointsMax: 210,
      });
    }
    if (path === "/api/v1/program/path")
      return reply(route, { enrollmentId: profileEnrollmentId, weeks: [] });
    if (path === "/api/v1/program/calendar")
      return reply(route, { enrollmentId: profileEnrollmentId, days: [] });
    // Datos auxiliares fuera de estos recorridos: ausencia explícita, sin fallback real.
    if (
      req.method() === "GET" &&
      [
        "/api/v1/program/notifications",
        "/api/v1/program/me/metrics-history",
        "/api/v1/program/me/scores-history",
        "/api/v1/program/scores",
      ].includes(path)
    )
      return reply(
        route,
        { detail: "Sin datos auxiliares en el fixture 2.26" },
        404,
      );
    if (req.method() !== "GET") {
      state.unexpected.push(`${req.method()} ${path}`);
      return reply(route, {}, 405);
    }
    if (path.startsWith("/api/v1/program/"))
      state.unexpected.push(`GET ${path}`);
    return reply(route, { items: [], data: [] }, 404);
  });
  // Ninguna foto, fuente o proveedor externo sale de la simulación.
  await appContext.route(/^https:\/\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    }),
  );
  for (const page of [erp, app])
    page.on("pageerror", (err) => state.pageErrors.push(err.message));
  const setDate = async (date: string) => {
    state.date = date;
    await Promise.all([
      erp.clock.setFixedTime(new Date(`${date}T15:00:00Z`)),
      app.clock.setFixedTime(new Date(`${date}T15:00:00Z`)),
    ]);
  };
  await setDate(state.date);
  return {
    erp,
    app,
    appContext,
    state,
    routines,
    routineA: routineId("01"),
    routineB: routineId("02"),
    routineC: routineId("03"),
    weekDetail,
    setDate,
    /** Evento de activación simulado: contrato de 2.5/2.8, no ejecuta el motor real. */
    activate: async (date: string) => {
      state.activeWeek = weekOf(date);
      for (let index = 0; index < 7; index++) {
        const day = addDays(date, index);
        state.activated.set(day, structuredClone(decision(day)));
      }
      await setDate(date);
    },
    openErpWeek: async (week = 2) => {
      await erp.goto(`/patients/${profilePatientId}/360`);
      await erp.getByRole("tab", { name: "Plan semanal", exact: true }).click();
      await erp
        .getByRole("row")
        .filter({
          has: erp.getByRole("cell", {
            name: new RegExp(`^${week} Ver tareas$`),
          }),
        })
        .getByRole("button", { name: "Ver tareas", exact: true })
        .click();
      return erp.getByRole("dialog", { name: `Semana ${week}`, exact: true });
    },
    openApp: async () => {
      await app.goto(erpAppOrigin);
      await app.locator(".hm-day-link").click();
      await app.locator(".pcards").waitFor({ state: "visible" });
      // Motion monta el contenido antes de terminar la transición de pantalla.
      await app.waitForFunction(() => {
        const screen = document.querySelector(".router-page");
        return screen && getComputedStyle(screen).opacity === "1";
      });
    },
    close: async () => appContext.close(),
  };
}
