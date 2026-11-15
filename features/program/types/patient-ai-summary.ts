/** Contrato ERP 4.4b de BACK 3b6e09e. Nunca contiene URLs del modelo. */
export type PatientSummarySection = "program" | "nutrition" | "exercise" | "podcasts" | "tests" | "measurements" | "alerts";
export interface PatientSummarySource {
  ref: string;
  section: PatientSummarySection;
  from: string;
  to: string;
}
export interface PatientAiSummary {
  id: string;
  kind: "patient_summary";
  isEstimate: true;
  summary: string;
  sourceRefs: string[];
  attention: { text: string; sourceRefs: string[] }[];
  model: string | null;
  generatedAt: string;
  language: "es" | "en";
  startDate: string;
  endDate: string;
  sources: PatientSummarySource[];
}
export type PatientSummaryResult =
  | { status: "ok"; summary: PatientAiSummary }
  | { status: "empty" | "insufficient" | "unavailable"; summary: null };
