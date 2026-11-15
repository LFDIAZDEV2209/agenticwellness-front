import type { EnrollmentWeekResponse } from ".";
import type { PatientSummarySource } from "./patient-ai-summary";

/** Contrato ERP 4.5b; cada elección se resuelve y valida en BACK. */
export interface WeeklyAiSuggestion {
  index: number;
  date: string;
  slotKind: "routine" | "podcast";
  kind: "routine" | "podcast" | "rest";
  resourceId: string | null;
  label: string;
  reason: string;
  sourceRefs: string[];
  state: "draft" | "applied";
  appliedAt: string | null;
  appliedBy: string | null;
}
export interface WeeklyAiDraft {
  id: string;
  kind: "weekly_plan_suggestions";
  isEstimate: true;
  state: "draft" | "applied";
  model: string | null;
  generatedAt: string;
  language: "es" | "en";
  startDate: string;
  endDate: string;
  planVersion: string;
  stale: boolean;
  sources: PatientSummarySource[];
  suggestions: WeeklyAiSuggestion[];
}
export type WeeklyAiResult = { status: "ok"; draft: WeeklyAiDraft }
  | { status: "empty" | "insufficient" | "unavailable"; draft: null };
export interface WeeklyAiApplication {
  status: "applied" | "already_applied";
  briefId: string;
  index: number;
  week: EnrollmentWeekResponse;
}
