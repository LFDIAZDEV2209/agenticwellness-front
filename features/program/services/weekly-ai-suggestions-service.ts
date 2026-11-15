import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import type { WeeklyAiResult, WeeklyAiSuggestion, WeeklyAiApplication } from "../types/weekly-ai-suggestions";
import type { PatientSummarySection, PatientSummarySource } from "../types/patient-ai-summary";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, limit: number): v is string => typeof v === "string" && !!v.trim() && v.length <= limit;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const utc = (v: unknown): v is string => typeof v === "string" && /(Z|\+00:00)$/.test(v) && Number.isFinite(Date.parse(v));
const ref = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/.test(v);
const sections = new Set(["program", "nutrition", "exercise", "podcasts", "tests", "measurements", "alerts"]);
const invalid = (): never => { throw new Error("weekly-ai-contract"); };

/** Valida el límite HTTP; las fuentes describen hechos recientes, no la semana futura. */
export function parseWeeklyAiResult(value: unknown, language: "es" | "en"): WeeklyAiResult {
  if (!object(value)) return invalid();
  if (["empty", "insufficient", "unavailable"].includes(String(value.status)) && value.draft === null)
    return { status: value.status as "empty" | "insufficient" | "unavailable", draft: null };
  const d = value.draft;
  if (value.status !== "ok" || !object(d) || !uuid(d.id) || d.kind !== "weekly_plan_suggestions" || d.isEstimate !== true
    || !["draft", "applied"].includes(String(d.state)) || d.language !== language || !utc(d.generatedAt)
    || !(d.model === null || text(d.model, 120)) || !text(d.planVersion, 128) || typeof d.stale !== "boolean"
    || !date(d.startDate) || !date(d.endDate) || d.startDate > d.endDate || Date.parse(d.endDate) - Date.parse(d.startDate) > 6 * 86400000
    || !Array.isArray(d.sources) || d.sources.length > 60 || !Array.isArray(d.suggestions) || d.suggestions.length > 5) return invalid();
  const sources: PatientSummarySource[] = d.sources.map(s => {
    if (!object(s) || !ref(s.ref) || typeof s.section !== "string" || !sections.has(s.section)
      || !date(s.from) || !date(s.to) || s.from > s.to) return invalid();
    return { ref: s.ref, section: s.section as PatientSummarySection, from: s.from, to: s.to };
  });
  const known = new Set(sources.map(s => s.ref));
  if (known.size !== sources.length) return invalid();
  const slots = new Set<string>();
  const startDate = d.startDate, endDate = d.endDate;
  const suggestions: WeeklyAiSuggestion[] = d.suggestions.map((s, index) => {
    if (!object(s) || s.index !== index || !date(s.date) || s.date < startDate || s.date > endDate
      || !["routine", "podcast"].includes(String(s.slotKind)) || !["routine", "podcast", "rest"].includes(String(s.kind))
      || (s.slotKind === "podcast" ? s.kind !== "podcast" : s.kind === "podcast")
      || (s.kind === "rest" ? s.resourceId !== null : !uuid(s.resourceId)) || !text(s.label, 500) || !text(s.reason, 2000)
      || !Array.isArray(s.sourceRefs) || !s.sourceRefs.length || s.sourceRefs.length > 60 || !s.sourceRefs.every(r => ref(r) && known.has(r))
      || !["draft", "applied"].includes(String(s.state))
      || (s.state === "applied" ? !utc(s.appliedAt) || !uuid(s.appliedBy) : s.appliedAt !== null || s.appliedBy !== null)) return invalid();
    const slot = `${s.date}:${s.slotKind}`;
    if (slots.has(slot)) return invalid();
    slots.add(slot);
    return { index, date: s.date, slotKind: s.slotKind as WeeklyAiSuggestion["slotKind"], kind: s.kind as WeeklyAiSuggestion["kind"],
      resourceId: s.resourceId as string | null, label: s.label, reason: s.reason, sourceRefs: s.sourceRefs as string[],
      state: s.state as WeeklyAiSuggestion["state"], appliedAt: s.appliedAt as string | null, appliedBy: s.appliedBy as string | null };
  });
  return { status: "ok", draft: { id: d.id, kind: "weekly_plan_suggestions", isEstimate: true, state: d.state as "draft" | "applied",
    model: d.model, generatedAt: d.generatedAt, language, startDate: d.startDate, endDate: d.endDate,
    planVersion: d.planVersion, stale: d.stale, sources, suggestions } };
}
const path = (enrollmentId: string, week: number) => `${env.apiUrl}/api/v1/program/erp/enrollments/${encodeURIComponent(enrollmentId)}/weeks/${week}/ai-suggestions`;
export async function requestWeeklyAi(enrollmentId: string, week: number, language: "es" | "en", signal: AbortSignal, generate = false) {
  const response = await apiFetch<unknown>(generate ? path(enrollmentId, week) : `${path(enrollmentId, week)}?language=${language}`, {
    method: generate ? "POST" : "GET", cache: "no-store", signal, timeoutMs: 30_000,
    ...(generate ? { body: JSON.stringify({ language }) } : {}),
  });
  return parseWeeklyAiResult(response, language);
}
export async function applyWeeklyAi(enrollmentId: string, week: number, briefId: string, index: number, signal: AbortSignal): Promise<WeeklyAiApplication> {
  // Solo identidad de borrador e índice en la ruta; el cliente nunca decide resourceId.
  const response = await apiFetch<unknown>(`${path(enrollmentId, week)}/${encodeURIComponent(briefId)}/suggestions/${index}/apply`, {
    method: "POST", body: JSON.stringify({ confirmed: true }), cache: "no-store", signal, timeoutMs: 30_000,
  });
  if (!object(response) || !["applied", "already_applied"].includes(String(response.status)) || response.briefId !== briefId || response.index !== index
    || !object(response.week) || response.week.weekNumber !== week || !date(response.week.weekStartDateLocal) || !date(response.week.weekEndDateLocal)
    || !Array.isArray(response.week.days) || response.week.days.length > 7
    || !response.week.days.every(day => object(day) && date(day.localDate) && Number.isInteger(day.weekday) && Array.isArray(day.tasks)
      && day.tasks.every(task => object(task) && text(task.taskCode, 80) && typeof task.scheduledPoints === "number"))) return invalid();
  return response as unknown as WeeklyAiApplication;
}
