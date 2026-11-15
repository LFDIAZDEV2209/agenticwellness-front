import type { Page } from "@playwright/test";
import type {
  IntakeDay,
  IntakeMacros,
  IntakeRecord,
} from "../../features/nutrition/types/nutrition-intake";
import {
  intakePatient,
  intakeToday,
  signedPhoto,
} from "./nutrition-intake-http";
import { mockIntakeReviewHttp } from "./nutrition-review-http";

export const reviewCycleId = `cycle-${intakePatient}`;
const plus = (date: string, n: number) =>
  new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
const values = (calories: number | null): IntakeMacros => ({
  calories,
  proteinG: 24,
  carbsG: 55,
  fatG: 12,
  fiberG: 8,
});

/** Lecturas reales 3.3/3.7/3.8 con períodos y referencias enteramente sintéticos. */
export async function mockCycleReviewHttp(
  page: Page,
  options: {
    english?: boolean;
    firstCycle?: boolean;
    empty?: boolean;
    waterOnly?: boolean;
    longContinuity?: boolean;
    noPhotos?: boolean;
    readonly?: boolean;
    canApprove?: boolean;
    unknownMenu?: boolean;
    todayEmpty?: boolean;
  } = {},
) {
  const start = plus(intakeToday, options.longContinuity ? -129 : -32);
  const end = plus(start, 29);
  const previousStart = plus(start, -33);
  const previousEnd = plus(previousStart, 29);
  const state = {
    failCurrent: false,
    failPrevious: false,
    malformed: false,
    delayed: false,
    release: () => {},
    reads: [] as string[],
  };
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.release = release;
  function dayFor(localDate: string): IntakeDay {
    const previous = localDate < start;
    const cycleStart = previous ? previousStart : start;
    const cycleEnd = previous ? previousEnd : end;
    const ordinal =
      (Date.parse(localDate) - Date.parse(cycleStart)) / 86400000 + 1;
    const codes = ["des", "alm", "mer", "cen"];
    const active =
      !options.empty && !(options.todayEmpty && localDate === intakeToday) &&
      (ordinal === 1 ||
        ordinal === 2 ||
        localDate === intakeToday ||
        (previous && localDate === plus(start, -1)));
    const record = (mealCode: string, index: number): IntakeRecord => ({
      id: `${localDate}-${mealCode}`,
      mealCode,
      recorded: values(
        ordinal === 1
          ? previous
            ? 300
            : 400
          : ordinal === 2
            ? previous
              ? 450
              : 550
            : null,
      ),
      waterMl: ordinal === 1 ? 250 : ordinal === 2 ? 500 : 0,
      origin: ordinal === 1 ? "ai_estimated" : "patient_confirmed",
      photo:
        ordinal === 1
          ? { url: signedPhoto, expiresAt: "2026-11-14T17:05:00Z" }
          : null,
      analysis: null,
      patientCorrection: index === 1 && ordinal === 2,
    });
    const records = active
      ? codes.slice(0, ordinal === 1 ? 4 : ordinal === 2 ? 2 : 1).map(record)
      : [];
    if (options.waterOnly) {
      records.length = 0;
      if (ordinal === 1)
        records.push({
          ...record("agua", 0),
          recorded: values(null),
          waterMl: 500,
          photo: null,
        });
    }
    return {
      localDate,
      cycleId: previous ? "previous-cycle" : reviewCycleId,
      cycleNumber: previous ? 1 : options.firstCycle ? 1 : 2,
      continuity: localDate > cycleEnd,
      menu:
        options.unknownMenu && ordinal === 2
          ? null
          : {
              prescriptionId: ordinal <= 15 ? "published-v1" : "published-v2",
              version: ordinal <= 15 ? 1 : 2,
              dayNumber: Math.min(30, ordinal),
              meals: codes.slice(0, ordinal === 2 ? 3 : 4).map((mealCode) => ({
                mealCode,
                name: `Menú histórico ${mealCode}`,
                planned: values(500),
              })),
            },
      records,
    };
  }
  const base = await mockIntakeReviewHttp(page, {
    english: options.english,
    noPhotos: options.noPhotos,
    readonly: options.readonly,
    canApprove: options.canApprove,
    cycleId: reviewCycleId,
    transformDay: (day) => dayFor(day.localDate),
  });
  const patient = base.store.get(intakePatient)!;
  await page.route("**/nutrition/cycles/*/review", (route) =>
    route.fulfill({
      status: route.request().method() === "GET" ? 200 : 403,
        contentType: "application/json",
      json: null,
    }),
  );
  patient.cycle!.startDate = start;
  patient.cycle!.endDate = end;
  patient.publishedCycle = structuredClone(patient.cycle);
  await page.route(
    `**/nutrition/patients/${intakePatient}/prescriptions?*`,
    (route) => {
      const header = {
        id: patient.cycle!.id,
        patientId: intakePatient,
        cycleId: reviewCycleId,
        version: 2,
        revision: patient.revision,
        state: "aprobado",
        isPublished: true,
        startDate: start,
        endDate: end,
        targets: { k: 2000, c: 250, p: 100, f: 70 },
      };
      return route.fulfill({
        json: [
          header,
          ...(options.firstCycle
            ? []
            : [
                {
                  ...header,
                  id: "previous-published",
                  cycleId: "previous-cycle",
                  startDate: previousStart,
                  endDate: previousEnd,
                },
              ]),
        ],
      });
    },
  );
  await page.route("**/nutrition/cycles/*/adherence?*", async (route) => {
    const url = new URL(route.request().url());
    state.reads.push(url.pathname + url.search);
    const previous = url.pathname.includes("previous-cycle");
    if (state.delayed) await gate;
    if (previous ? state.failPrevious : state.failCurrent)
      return route.fulfill({
        status: 503,
        json: { detail: "Lectura sintética no disponible" },
      });
    if (state.malformed)
      return route.fulfill({ json: { cycleId: reviewCycleId, adherence: 0 } });
    const from = previous ? previousStart : start;
    const through = previous ? plus(start, -1) : intakeToday;
    const days = Array.from(
      { length: (Date.parse(through) - Date.parse(from)) / 86400000 + 1 },
      (_, i) => dayFor(plus(from, i)),
    );
    const daily = days.map((day) => {
      const food = day.records.filter((row) => row.mealCode !== "agua");
      return {
        date: day.localDate,
        continuity: day.continuity,
        recordedMeals: food.length,
        plannedMeals: day.menu?.meals.length ?? null,
        adherence:
          food.length && day.menu
            ? Math.round((food.length / day.menu.meals.length) * 100) / 100
            : null,
        interruption: !food.length && day.localDate < intakeToday,
        prescriptionId: day.menu?.prescriptionId ?? null,
        menuDay: day.menu?.dayNumber ?? null,
        intakeIds: food.map((row) => row.id),
      };
    });
    const withFood = daily.filter((day) => day.recordedMeals > 0);
    const unknown = withFood.filter((day) => day.adherence === null).length;
    return route.fulfill({
      json: {
        cycleId: previous ? "previous-cycle" : reviewCycleId,
        number: previous ? 1 : options.firstCycle ? 1 : 2,
        state: previous ? "revisado" : "por_revisar",
        startDate: from,
        endDate: previous ? previousEnd : end,
        from,
        through,
        adherence:
          !withFood.length || unknown
            ? null
            : Math.round(
                (withFood.reduce((sum, day) => sum + day.adherence!, 0) /
                  withFood.length) *
                  100,
              ) / 100,
        daysWithData: withFood.length,
        elapsedDays: daily.filter(day => day.recordedMeals > 0 || day.date < intakeToday).length,
        interruptions: daily.filter(day => day.interruption).length,
        daysWithUnknownMenu: unknown,
        page: 1,
        pageSize: 100,
        days: daily.slice(0, 100),
      },
    });
  });
  return { ...base, reviewState: state, start, end, dayFor };
}
