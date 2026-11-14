import type { IntakeDay, IntakeRecord } from "../types/nutrition-intake";
import type {
  PeriodAverage,
  PeriodMetric,
} from "../types/nutrition-cycle-review";

/** Sumas diarias y media de días conocidos. Un valor ausente no se sustituye por cero. */
export function periodAverage(
  days: IntakeDay[],
  metric: PeriodMetric,
  origin?: IntakeRecord["origin"],
): PeriodAverage {
  const values: number[] = [];
  const planned: number[] = [];
  for (const day of days) {
    const records = day.records.filter(
      (row) =>
        (metric === "waterMl" || row.mealCode !== "agua") &&
        (!origin || row.origin === origin),
    );
    const amounts = records
      .map((row) => (metric === "waterMl" ? row.waterMl : row.recorded[metric]))
      .filter((n) => metric !== "waterMl" || n !== null);
    if (!amounts.length || amounts.some((n) => n === null)) continue;
    values.push((amounts as number[]).reduce((sum, n) => sum + n, 0));
    if (metric === "waterMl" || !day.menu?.meals.length) continue;
    const targets = day.menu.meals.map((meal) => meal.planned[metric]);
    if (targets.every((n) => n !== null))
      planned.push((targets as number[]).reduce((sum, n) => sum + n, 0));
  }
  return {
    value: values.length
      ? values.reduce((sum, n) => sum + n, 0) / values.length
      : null,
    days: values.length,
    planned: planned.length
      ? planned.reduce((sum, n) => sum + n, 0) / planned.length
      : null,
    plannedDays: planned.length,
  };
}
