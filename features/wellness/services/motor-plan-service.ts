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
  engine_ver?: string;
  params_version?: number;
}

export async function readMotorPlanDay(patientId: string, signal: AbortSignal) {
  const day = await apiFetch<MotorPlanDay>(
    `${env.apiUrl}/api/v1/people/${encodeURIComponent(patientId)}/plan`,
    { signal, cache: "no-store" },
  );
  if (!day || !Number.isInteger(day.today) || day.today < 1 || day.today > 365 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day.todayLocalDate) || !Number.isFinite(Date.parse(day.todayLocalDate)) ||
    !day.status || !["active", "paused", "maint"].includes(day.status.state) ||
    !(day.measuredWeightKg === null || Number.isFinite(day.measuredWeightKg)))
    throw new Error("Invalid Motor 365 day");
  return day;
}

export interface MotorWeeklyEvent {
  d: number;
  k: "ajuste" | "sin";
  delta: number;
  rate: number | null;
  es: string;
  en: string;
}

export async function readMotorWeeklyEvents(patientId: string, signal: AbortSignal) {
  const events = await apiFetch<MotorWeeklyEvent[]>(
    `${env.apiUrl}/api/v1/people/${encodeURIComponent(patientId)}/weekly-events`,
    { signal, cache: "no-store" },
  );
  if (!Array.isArray(events) || events.some(event =>
    !event || !Number.isInteger(event.d) || event.d < 14 || event.d > 364 || event.d % 7 !== 0 ||
    !["ajuste", "sin"].includes(event.k) || !Number.isFinite(event.delta) ||
    !(event.rate === null || Number.isFinite(event.rate)) ||
    typeof event.es !== "string" || typeof event.en !== "string"))
    throw new Error("Invalid Motor 365 weekly events");
  return events;
}
