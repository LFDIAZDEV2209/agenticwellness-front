import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";

export type MotorEventKind = "ajuste" | "sin" | "meta" | "modo";
export type MotorEventFilter = { from: string; to: string; kind: string };

export interface MotorTimelineEvent {
  id: string;
  day: number;
  kind: MotorEventKind;
  occurredAt: string;
  planVersion: number;
  parametersVersion: number;
  engineVersion: string;
  calorieDelta: number | null;
  ratePercent: number | null;
  messageEs: string;
  messageEn: string;
}

interface TimelinePage {
  events: MotorTimelineEvent[];
  page: number;
  hasNext: boolean;
}

const endpoint = (id: string) => `${env.apiUrl}/api/v1/program/erp/patients/${encodeURIComponent(id)}/motor-timeline`;

function queryFor(filters: MotorEventFilter) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value)));
}

export const readMotorTimeline = (id: string, filters: MotorEventFilter, page: number, signal: AbortSignal) => {
  const query = queryFor(filters);
  query.set("page", String(page));
  return apiFetch<TimelinePage>(`${endpoint(id)}?${query}`, { cache: "no-store", signal });
};

export const exportMotorTimeline = (id: string, filters: MotorEventFilter, lang: "es" | "en", signal: AbortSignal) => {
  const query = queryFor(filters);
  query.set("lang", lang);
  return apiFetch<Blob>(`${endpoint(id)}/export?${query}`, { method: "POST", responseType: "blob", cache: "no-store", signal });
};
