import { apiFetch, ApiError } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import { NutritionRequestError } from "./nutrition-service";
import type { IntakePage } from "../types/nutrition-intake";

/** Fechas civiles: UTC sirve solo como eje aritmético, nunca como zona del paciente. */
export function intakeDate(value: string) {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    throw new Error("intake-date-contract");
  return time;
}
export function addIntakeDays(date: string, days: number) {
  return new Date(intakeDate(date) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
export function intakeDates(from: string, to: string) {
  return Array.from(
    {
      length: Math.max(0, (intakeDate(to) - intakeDate(from)) / 86_400_000 + 1),
    },
    (_, index) => addIntakeDays(from, index),
  );
}

/** Valida el borde HTTP; una respuesta incompleta nunca equivale a un día sin registros. */
export function mapIntakePage(
  wire: IntakePage,
  from: string,
  to: string,
  today: string,
  timezone: string,
): IntakePage {
  const through = to < today ? to : today;
  const dates = intakeDates(from, through);
  const nonnegative = (n: unknown) =>
    n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0);
  const macros = (m: {
    calories: unknown;
    proteinG: unknown;
    carbsG: unknown;
    fatG: unknown;
    fiberG: unknown;
  }) =>
    m &&
    [m.calories, m.proteinG, m.carbsG, m.fatG, m.fiberG].every(nonnegative);
  if (
    !wire ||
    wire.from !== from ||
    wire.through !== through ||
    wire.timezone !== timezone ||
    wire.page !== 1 ||
    wire.pageSize !== 100 ||
    wire.totalDays !== dates.length ||
    wire.totalPages !== (dates.length ? 1 : 0) ||
    !Array.isArray(wire.days) ||
    wire.days.length !== dates.length
  )
    throw new Error("intake-page-contract");
  const seen = new Set<string>();
  for (const day of wire.days) {
    if (
      !day ||
      !dates.includes(day.localDate) ||
      seen.has(day.localDate) ||
      typeof day.continuity !== "boolean" ||
      !(day.cycleId === null || typeof day.cycleId === "string") ||
      !(
        day.cycleNumber === null ||
        (Number.isInteger(day.cycleNumber) && day.cycleNumber > 0)
      ) ||
      !Array.isArray(day.records)
    )
      throw new Error("intake-day-contract");
    seen.add(day.localDate);
    if (day.menu !== null) {
      const m = day.menu;
      if (
        !m ||
        typeof m.prescriptionId !== "string" ||
        !Number.isInteger(m.version) ||
        m.version < 1 ||
        !Number.isInteger(m.dayNumber) ||
        m.dayNumber < 1 ||
        m.dayNumber > 30 ||
        !Array.isArray(m.meals) ||
        new Set(m.meals.map((row) => row.mealCode)).size !== m.meals.length ||
        m.meals.some(
          (row) =>
            typeof row.mealCode !== "string" ||
            !(row.name === null || typeof row.name === "string") ||
            !macros(row.planned),
        )
      )
        throw new Error("intake-menu-contract");
    }
    const records = new Set<string>();
    for (const row of day.records) {
      if (
        !row ||
        typeof row.id !== "string" ||
        records.has(row.id) ||
        typeof row.mealCode !== "string" ||
        !macros(row.recorded) ||
        !nonnegative(row.waterMl) ||
        !["ai_estimated", "patient_confirmed"].includes(
          row.origin,
        ) ||
        typeof row.patientCorrection !== "boolean"
      )
        throw new Error("intake-record-contract");
      records.add(row.id);
      if (
        row.photo !== null &&
        (!row.photo ||
          !/^https?:\/\//.test(row.photo.url) ||
          !Number.isFinite(Date.parse(row.photo.expiresAt)))
      )
        throw new Error("intake-photo-contract");
      if (
        row.analysis !== null &&
        (!row.analysis ||
          typeof row.analysis.analysisId !== "string" ||
          typeof row.analysis.status !== "string" ||
          !macros(row.analysis.estimated) ||
          !Array.isArray(row.analysis.items) ||
          row.analysis.items.some(
            (item) =>
              typeof item.name !== "string" ||
              typeof item.confidence !== "number" ||
              !Number.isFinite(item.confidence) ||
              !nonnegative(item.estimatedGrams) ||
              !(
                item.portionSize === null ||
                typeof item.portionSize === "string"
              ) ||
              !macros(item.estimated),
          ))
      )
        throw new Error("intake-analysis-contract");
    }
  }
  return wire;
}

export async function fetchNutritionIntake(
  patientId: string,
  from: string,
  to: string,
  today: string,
  timezone: string,
  signal: AbortSignal,
) {
  const path = `/api/v1/nutrition/patients/${encodeURIComponent(patientId)}/intake`;
  try {
    const params = new URLSearchParams({
      from,
      to,
      page: "1",
      pageSize: "100",
    });
    const wire = await apiFetch<IntakePage>(`${env.apiUrl}${path}?${params}`, {
      signal,
      cache: "no-store",
    });
    try {
      return mapIntakePage(wire, from, to, today, timezone);
    } catch {
      throw new NutritionRequestError({
        kind: "contract",
        endpoint: `GET ${path}`,
        status: 502,
      });
    }
  } catch (error) {
    if (error instanceof NutritionRequestError) throw error;
    throw new NutritionRequestError({
      kind: "request",
      endpoint: `GET ${path}`,
      status: error instanceof ApiError ? error.status : 0,
    });
  }
}
