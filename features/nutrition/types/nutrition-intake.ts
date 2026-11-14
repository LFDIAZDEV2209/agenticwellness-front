/** DTO de 3.7 verificado contra BACK 92da468; ver INTAKE-CONTRACT.md. */
export interface IntakeMacros {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}
export interface IntakeRecord {
  id: string;
  mealCode: string;
  recorded: IntakeMacros;
  waterMl: number | null;
  origin: "ai_estimated" | "patient_confirmed";
  photo: { url: string; expiresAt: string } | null;
  analysis: {
    analysisId: string;
    status: string;
    estimated: IntakeMacros;
    items: {
      name: string;
      confidence: number;
      portionSize: string | null;
      estimatedGrams: number | null;
      estimated: IntakeMacros;
    }[];
  } | null;
  patientCorrection: boolean;
}
export interface IntakeDay {
  localDate: string;
  cycleId: string | null;
  cycleNumber: number | null;
  continuity: boolean;
  menu: {
    prescriptionId: string;
    version: number;
    dayNumber: number;
    meals: { mealCode: string; name: string | null; planned: IntakeMacros }[];
  } | null;
  records: IntakeRecord[];
}
export interface IntakePage {
  from: string;
  through: string;
  timezone: string;
  page: number;
  pageSize: number;
  totalDays: number;
  totalPages: number;
  days: IntakeDay[];
}
