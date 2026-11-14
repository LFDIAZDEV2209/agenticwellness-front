import type { Page } from "@playwright/test";
import type {
  IntakeDay,
  IntakeMacros,
  IntakePage,
  IntakeRecord,
} from "../../features/nutrition/types/nutrition-intake";
import { mockNutritionHttp } from "./nutrition-http";

export const intakePatient = "demo-patient-2";
export const intakeToday = "2026-11-14";
const dayMs = 86_400_000;
const plus = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * dayMs)
    .toISOString()
    .slice(0, 10);
const macros = (calories: number | null): IntakeMacros => ({
  calories,
  proteinG: calories === null ? null : 24,
  carbsG: 55,
  fatG: 12,
  fiberG: 8,
});
export const signedPhoto =
  "https://nutrition-photo.example.invalid/meal.png?signature=synthetic";

/** 3.14: fuente HTTP enteramente sintética, sin pacientes ni archivos reales. */
export async function mockIntakeHttp(
  page: Page,
  options: {
    status?: number;
    malformed?: boolean;
    noRecordsPermission?: boolean;
    noPhotos?: boolean;
    empty?: boolean;
    future?: boolean;
    expiredPhoto?: boolean;
    longContinuity?: boolean;
    nextCycle?: boolean;
    english?: boolean;
    delay?: boolean;
    canManage?: boolean;
    transformDay?: (day: IntakeDay) => IntakeDay;
    cycleId?: string;
  } = {},
) {
  await page.clock.install({ time: new Date("2026-11-14T17:00:00Z") });
  const permissions = [
    "Nutrition.View",
    ...(options.noRecordsPermission ? [] : ["Nutrition.RecordsView"]),
    ...(options.noPhotos ? [] : ["Nutrition.PhotosView"]),
    ...(options.canManage ? ["Nutrition.Manage", "Nutrition.NotesView"] : []),
  ];
  const base = await mockNutritionHttp(page, permissions, {
    english: options.english,
  });
  const patient = base.store.get(intakePatient)!;
  const start = options.future
    ? plus(intakeToday, -3)
    : options.longContinuity
      ? plus(intakeToday, -94)
      : plus(intakeToday, -32);
  const end = plus(start, 29);
  patient.cycle!.startDate = start;
  patient.cycle!.endDate = end;
  patient.cycle!.state = "aprobado";
  patient.cycle!.version = 2;
  patient.publishedCycle = structuredClone(patient.cycle);
  if (options.nextCycle) {
    await page.route(
      `**/nutrition/patients/${intakePatient}/prescriptions?*`,
      async (route) => {
        const header = {
          id: patient.cycle!.id,
          patientId: intakePatient,
          cycleId: `cycle-${intakePatient}`,
          version: 2,
          revision: patient.revision,
          state: "aprobado",
          isPublished: true,
          startDate: start,
          endDate: end,
          targets: { k: 2000, c: 250, p: 100, f: 70 },
        };
        await route.fulfill({
          json: [
            header,
            {
              ...header,
              id: "next-cycle-version",
              cycleId: "next-cycle",
              startDate: plus(end, 2),
              endDate: plus(end, 31),
            },
          ],
        });
      },
    );
  }
  const state = {
    status: options.status ?? 200,
    malformed: options.malformed ?? false,
    requests: [] as { from: string; to: string; method: string }[],
    photoRequests: 0,
    delayed: options.delay ?? false,
    release: () => {},
  };
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.release = release;
  await page.route("https://nutrition-photo.example.invalid/**", (route) => {
    state.photoRequests++;
    return route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF7sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });
  await page.route(
    `**/nutrition/patients/${intakePatient}/intake?*`,
    async (route) => {
      const url = new URL(route.request().url());
      const from = url.searchParams.get("from")!;
      const to = url.searchParams.get("to")!;
      state.requests.push({ from, to, method: route.request().method() });
      if (state.delayed) await gate;
      if (state.status !== 200)
        return route.fulfill({
          status: state.status,
          json: { detail: "Fallo sintético" },
        });
      if (state.malformed) return route.fulfill({ json: { days: [] } });
      const through = to > intakeToday ? intakeToday : to;
      const length = Math.max(
        0,
        (Date.parse(through) - Date.parse(from)) / dayMs + 1,
      );
      const record = (
        code: string,
        origin: IntakeRecord["origin"],
        correction = false,
        withoutAnalysis = false,
      ): IntakeRecord => ({
        id: `synthetic-${code}`,
        mealCode: code,
        recorded: macros(withoutAnalysis ? null : correction ? 890 : 510),
        waterMl: null,
        origin,
        // Incluso si una respuesta defectuosa incluyera foto a coordinación, la UI no la solicita.
        photo: withoutAnalysis
          ? null
          : {
              url: signedPhoto,
              expiresAt: options.expiredPhoto
                ? "2026-11-14T16:59:00Z"
                : "2026-11-14T17:05:00Z",
            },
        analysis: withoutAnalysis
          ? null
          : {
              analysisId: "synthetic-analysis",
              status: "completed",
              estimated: macros(800),
              items: [
                {
                  name: "Pollo guisado",
                  confidence: 0.94,
                  portionSize: "Una porción",
                  estimatedGrams: 120,
                  estimated: macros(198),
                },
              ],
            },
        patientCorrection: correction,
      });
      const days: IntakeDay[] = Array.from({ length }, (_, index) => {
        const localDate = plus(through, -index);
        const ordinal = (Date.parse(localDate) - Date.parse(start)) / dayMs + 1;
        const codes = ["des", "alm", "mer", "cen"];
        return {
          localDate,
          cycleId: options.cycleId ?? "synthetic-cycle",
          cycleNumber: 2,
          continuity: localDate > end,
          menu: {
            prescriptionId: ordinal <= 15 ? "published-v1" : "published-v2",
            version: ordinal <= 15 ? 1 : 2,
            dayNumber: Math.min(ordinal, 30),
            meals: codes.map((mealCode) => ({
              mealCode,
              name:
                ordinal <= 15
                  ? "Menú histórico de lentejas"
                  : "Tilapia con arroz y ensalada",
              planned: macros(698),
            })),
          },
          records:
            options.empty || ordinal === 3 || ordinal === 31
              ? []
              : ordinal === 1
                ? codes.map((code) => record(code, "ai_estimated"))
                : localDate === intakeToday
                  ? [
                      record("alm", "patient_confirmed", true),
                      record("des", "patient_confirmed", false, true),
                    ]
                  : [record("des", "ai_estimated")],
        };
      });
      const result: IntakePage = {
        from,
        through,
        timezone: "America/Bogota",
        page: 1,
        pageSize: Number(url.searchParams.get("pageSize")),
        totalDays: length,
        totalPages: length ? 1 : 0,
        days: options.transformDay ? days.map(options.transformDay) : days,
      };
      return route.fulfill({ json: result });
    },
  );
  return { ...base, state, start, end };
}
