import type { IntakeDay, IntakeMacros } from "./nutrition-intake";

/** Lectura real de 3.3; los agregados pertenecen al rango completo, no solo a Days. */
export interface CycleAdherence {
  cycleId: string;
  number: number | null;
  state: "borrador" | "en_curso" | "por_revisar" | "revisado" | "interrumpido";
  startDate: string | null;
  endDate: string | null;
  from: string | null;
  through: string | null;
  adherence: number | null;
  daysWithData: number;
  elapsedDays: number;
  interruptions: number;
  daysWithUnknownMenu: number;
  page: number;
  pageSize: number;
  days: {
    date: string;
    continuity: boolean;
    recordedMeals: number;
    plannedMeals: number | null;
    adherence: number | null;
    interruption: boolean;
    prescriptionId: string | null;
    menuDay: number | null;
    intakeIds: string[];
  }[];
}
export interface NutritionPeriodRead {
  adherence: CycleAdherence;
  days: IntakeDay[];
}
export type PeriodMetric = keyof IntakeMacros | "waterMl";
export interface PeriodAverage {
  value: number | null;
  days: number;
  planned: number | null;
  plannedDays: number;
}
