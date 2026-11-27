import { ApiError, apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";

export interface MotorNutritionTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
}

export type MotorText = { es: string; en: string };

interface MotorExerciseSession {
  name: MotorText;
  minutes: number;
  deload: boolean;
  phase: { name: MotorText };
  items: { id: string; minutes: number; guide: { es: { n: string }; en: { n: string } };
    strength: { sets: number; reps: number; holdSeconds: number } | null }[];
}

interface MotorMeals {
  meals: { id: string; name: MotorText; options: {
    items: { food: string; name: MotorText; grams: number }[];
  }[] }[];
}

export interface MotorPlanOverview {
  goal: "bajar" | "masa" | "def";
  targetWeightKg: number | null;
  week: { day: number; exercise: MotorText | null; minutes: number; paused: boolean; future: boolean;
    completedExercise: boolean | null }[];
  progress: {
    recordedDays: number;
    completedExercise: boolean | null;
    weightKg: { day: number; value: number } | null;
    waistCm: { day: number; value: number } | null;
  };
  recentEvents: { d: number; k: string; es: string; en: string }[];
}

export interface MotorPlanDay {
  nutrition?: MotorNutritionTargets;
  today: number;
  todayLocalDate: string;
  adherence?: number | null;
  streak?: number;
  exercise?: MotorExerciseSession | null;
  mealPlan?: MotorMeals;
  why?: MotorText[];
  overview?: MotorPlanOverview;
  status: { state: "active" | "paused" | "maint" };
  logStatus: "open" | "recorded" | "missing";
  measuredWeightKg: number | null;
  timeZoneId: string;
  engine_ver?: string;
  params_version?: number;
}

export async function readMotorPlanDay(patientId: string, signal: AbortSignal) {
  const path = `${env.apiUrl}/api/v1/people/${encodeURIComponent(patientId)}/plan`;
  const options = { signal, cache: "no-store" } as const;
  const day = await apiFetch<MotorPlanDay>(`${path}/overview`, options).catch((error: unknown) => {
    // Un API anterior trata "overview" como un día no numérico durante un despliegue escalonado.
    if (error instanceof ApiError && error.status === 400 && error.extensions?.error === "bad_day")
      return apiFetch<MotorPlanDay>(path, options);
    throw error;
  });
  if (!day || !Number.isInteger(day.today) || day.today < 1 || day.today > 365 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day.todayLocalDate) || !Number.isFinite(Date.parse(day.todayLocalDate)) ||
    !day.status || !["active", "paused", "maint"].includes(day.status.state) ||
    !(day.measuredWeightKg === null || Number.isFinite(day.measuredWeightKg)))
    throw new Error("Invalid Motor 365 day");
  return day;
}

export function motorPlanBlockReason(error: ApiError): MotorText | undefined {
  const status = error.extensions?.status;
  if (!status || typeof status !== "object" || !("message" in status)) return;
  const message = status.message;
  if (message && typeof message === "object" && "es" in message && "en" in message &&
    typeof message.es === "string" && typeof message.en === "string") {
    return { es: message.es, en: message.en };
  }
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
