import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import type { PatientSummaryResult, PatientSummarySection, PatientSummarySource } from "../types/patient-ai-summary";

const sections: PatientSummarySection[] = ["program", "nutrition", "exercise", "podcasts", "tests", "measurements", "alerts"];
const sectionOf = (value: unknown): value is PatientSummarySection => sections.some(section => section === value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const ref = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/.test(value);
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Un DTO inválido no se confunde con un resumen vacío ni llega al render. */
export function parsePatientSummary(value: unknown, language: "es" | "en"): PatientSummaryResult {
  if (!object(value)) throw new Error("patient-summary-contract");
  if ((value.status === "empty" || value.status === "insufficient" || value.status === "unavailable") && value.summary === null)
    return { status: value.status, summary: null };
  const s = value.summary;
  if (value.status !== "ok" || !object(s) || !text(s.id, 36) || !/^[a-f0-9-]{36}$/i.test(s.id)
    || s.kind !== "patient_summary" || s.isEstimate !== true || !text(s.summary, 2000)
    || s.language !== language || !date(s.startDate) || !date(s.endDate) || s.startDate > s.endDate
    || Date.parse(s.endDate) - Date.parse(s.startDate) > 6 * 86_400_000
    || typeof s.generatedAt !== "string" || !/(Z|\+00:00)$/.test(s.generatedAt) || !Number.isFinite(Date.parse(s.generatedAt))
    || !(s.model === null || text(s.model, 200)) || !Array.isArray(s.sources) || s.sources.length > 60
    || !Array.isArray(s.sourceRefs) || s.sourceRefs.length < 1 || s.sourceRefs.length > 60
    || !Array.isArray(s.attention) || s.attention.length > 5) throw new Error("patient-summary-contract");
  const sources: PatientSummarySource[] = [];
  for (const source of s.sources) {
    if (!object(source) || !ref(source.ref) || !sectionOf(source.section)
      || !date(source.from) || !date(source.to) || source.from > source.to
      || source.from < s.startDate || source.to > s.endDate || sources.some(row => row.ref === source.ref))
      throw new Error("patient-summary-contract");
    sources.push({ ref: source.ref, section: source.section, from: source.from, to: source.to });
  }
  const known = new Set(sources.map(source => source.ref));
  const refs = (items: unknown, max: number): items is string[] => Array.isArray(items) && items.length > 0 && items.length <= max
    && items.every(item => ref(item) && known.has(item));
  if (!refs(s.sourceRefs, 60)) throw new Error("patient-summary-contract");
  const attention = s.attention.map(item => {
    if (!object(item) || !text(item.text, 2000) || !refs(item.sourceRefs, 10)) throw new Error("patient-summary-contract");
    return { text: item.text, sourceRefs: item.sourceRefs };
  });
  // El backend valida las citas. El navegador mantiene el texto plano incluso ante contenido hostil.
  return { status: "ok", summary: {
    id: s.id, kind: "patient_summary", isEstimate: true, summary: s.summary,
    sourceRefs: s.sourceRefs, attention, model: s.model, generatedAt: s.generatedAt,
    language, startDate: s.startDate, endDate: s.endDate, sources,
  } };
}

export async function requestPatientSummary(patientId: string, language: "es" | "en", signal: AbortSignal, generate = false) {
  const path = `${env.apiUrl}/api/v1/program/erp/patients/${encodeURIComponent(patientId)}/ai-summary`;
  const result = await apiFetch<unknown>(generate ? path : `${path}?language=${language}`, {
    method: generate ? "POST" : "GET", cache: "no-store", signal, timeoutMs: 30_000,
    ...(generate ? { body: JSON.stringify({ language }) } : {}),
  });
  return parsePatientSummary(result, language);
}

export function formatSummaryDate(value: string, language: "es" | "en") {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
