import { apiFetch, ApiError } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import { NutritionRequestError } from "./nutrition-service";
import {
  addIntakeDays,
  fetchNutritionIntake,
  intakeDate,
  intakeDates,
} from "./nutrition-intake-service";
import type {
  CycleAdherence,
  NutritionPeriodRead,
} from "../types/nutrition-cycle-review";

export async function fetchCycleAdherence(
  cycleId: string,
  signal: AbortSignal,
  today: string,
) {
  const endpoint = `/api/v1/nutrition/cycles/${encodeURIComponent(cycleId)}/adherence`;
  let wire: CycleAdherence;
  try {
    wire = await apiFetch<CycleAdherence>(
      `${env.apiUrl}${endpoint}?page=1&pageSize=100`,
      { signal, cache: "no-store" },
    );
  } catch (error) {
    throw new NutritionRequestError({
      kind: "request",
      endpoint: `GET ${endpoint}`,
      status: error instanceof ApiError ? error.status : 0,
    });
  }
  try {
    const calendarDays = wire?.from && wire?.through
      ? intakeDates(wire.from, wire.through).length : 0;
    const inProgress = calendarDays - wire?.elapsedDays;
    const count = (n: unknown) =>
      typeof n === "number" && Number.isInteger(n) && n >= 0;
    if (
      !wire ||
      wire.cycleId !== cycleId ||
      !(wire.number === null || (count(wire.number) && wire.number > 0)) ||
      ![
        "borrador",
        "en_curso",
        "por_revisar",
        "revisado",
        "interrumpido",
      ].includes(wire.state) ||
      ![
        wire.daysWithData,
        wire.elapsedDays,
        wire.interruptions,
        wire.daysWithUnknownMenu,
      ].every(count) ||
      wire.daysWithData + wire.interruptions !== wire.elapsedDays ||
      wire.daysWithUnknownMenu > wire.daysWithData ||
      !(
        wire.adherence === null ||
        (Number.isFinite(wire.adherence) && wire.adherence >= 0)
      ) ||
      wire.page !== 1 ||
      wire.pageSize !== 100 ||
      !Array.isArray(wire.days) ||
      wire.days.length !== Math.min(100, calendarDays) ||
      !(inProgress === 0 || (inProgress === 1 && wire.through === today))
    )
      throw new Error("cycle-adherence-contract");
    for (const date of [wire.startDate, wire.endDate, wire.from, wire.through])
      if (date !== null) intakeDate(date);
    if (wire.elapsedDays && (!wire.from || !wire.through))
      throw new Error("cycle-range-contract");
    for (const [index, day] of wire.days.entries()) {
      if (
        day.date !== addIntakeDays(wire.from!, index) ||
        !count(day.recordedMeals) ||
        !(
          day.plannedMeals === null ||
          (count(day.plannedMeals) && day.plannedMeals > 0)
        ) ||
        typeof day.continuity !== "boolean" ||
        typeof day.interruption !== "boolean" ||
        (day.date === today && day.recordedMeals === 0 && day.interruption) ||
        (inProgress === 1 && day.date === today && day.recordedMeals !== 0) ||
        !(
          day.adherence === null ||
          (Number.isFinite(day.adherence) && day.adherence >= 0)
        ) ||
        !Array.isArray(day.intakeIds) ||
        day.intakeIds.some((id) => typeof id !== "string")
      )
        throw new Error("cycle-day-contract");
    }
    return wire;
  } catch {
    throw new NutritionRequestError({
      kind: "contract",
      endpoint: `GET ${endpoint}`,
      status: 502,
    });
  }
}

/** Un agregado del período usa todas sus fechas, también continuidad; nunca una media de la primera página. */
export async function fetchNutritionPeriod(
  patientId: string,
  cycleId: string,
  today: string,
  timezone: string,
  signal: AbortSignal,
): Promise<NutritionPeriodRead> {
  const adherence = await fetchCycleAdherence(cycleId, signal, today);
  if (!adherence.from || !adherence.through)
    return { adherence, days: [] };
  const days: NutritionPeriodRead["days"] = [];
  // Ventanas de hasta 100 días, dentro del máximo 366 de 3.7. Sin petición por día.
  for (
    let from = adherence.from;
    from <= adherence.through;
    from = addIntakeDays(from, 100)
  ) {
    const to = [addIntakeDays(from, 99), adherence.through].sort()[0];
    const page = await fetchNutritionIntake(
      patientId,
      from,
      to,
      today,
      timezone,
      signal,
    );
    if (page.days.some((day) => day.cycleId !== cycleId))
      throw new NutritionRequestError({
        kind: "contract",
        endpoint: "GET nutrition intake",
        status: 502,
      });
    days.push(...page.days);
  }
  return {
    adherence,
    days: days.sort((a, b) => a.localDate.localeCompare(b.localDate)),
  };
}
