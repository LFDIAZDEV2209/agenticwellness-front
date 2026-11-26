import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";

export interface MotorNutritionTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
}

export interface MotorPlanDay {
  nutrition?: MotorNutritionTargets;
  today: number;
  todayLocalDate: string;
  status: { state: "active" | "paused" | "maint" };
  logStatus: "open" | "recorded" | "missing";
  measuredWeightKg: number | null;
  timeZoneId: string;
}

export async function readMotorPlanDay(patientId: string, signal: AbortSignal) {
  const day = await apiFetch<MotorPlanDay>(
    `${env.apiUrl}/api/v1/people/${encodeURIComponent(patientId)}/plan`,
    { signal, cache: "no-store" },
  );
  if (!day || !Number.isInteger(day.today) || day.today < 1 || day.today > 365 ||
    !day.status || !["active", "paused", "maint"].includes(day.status.state) ||
    !(day.measuredWeightKg === null || Number.isFinite(day.measuredWeightKg)))
    throw new Error("Invalid Motor 365 day");
  return day;
}
