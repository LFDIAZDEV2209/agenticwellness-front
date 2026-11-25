import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";

export interface Year365Day {
  day: number;
  date: string;
  future: boolean | null;
  adherencePercent: number | null;
  weightKg: number | null;
  waistCm: number | null;
}

export interface Year365Measurement {
  date: string;
  value: number;
}

export interface Year365Report {
  startDate: string;
  endDate: string;
  today: string | null;
  months: string[];
  month: string;
  days: Year365Day[];
  summary: {
    recordedDays: number;
    adherencePercent: number | null;
    weight: Year365Measurement | null;
    waist: Year365Measurement | null;
    streakDays: number | null;
    scheduledPauseDays: number | null;
    safetyExercisePauseDays: number | null;
  };
  events: { id: string; day: number; date: string; kind: string }[];
}

export async function fetchYear365Report(
  patientId: string,
  month: string | null,
  signal: AbortSignal,
) {
  const query = month ? `?${new URLSearchParams({ month })}` : "";
  const url = `${env.apiUrl}/api/v1/program/erp/patients/${encodeURIComponent(patientId)}/year-365`;
  return apiFetch<{ report: Year365Report | null }>(`${url}${query}`, { signal });
}

export type Year365ExportFormat = "csv" | "pdf";

export async function fetchYear365Export(
  patientId: string,
  month: string,
  format: Year365ExportFormat,
  lang: "es" | "en",
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ month, lang });
  const url = `${env.apiUrl}/api/v1/program/erp/patients/${encodeURIComponent(patientId)}/year-365/export/${format}`;
  return apiFetch<Blob>(`${url}?${query}`, { signal, responseType: "blob" });
}
