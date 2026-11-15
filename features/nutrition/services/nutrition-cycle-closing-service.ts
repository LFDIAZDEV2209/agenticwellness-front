import { apiFetch, ApiError } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import { NutritionRequestError } from "./nutrition-service";

/** DTO ERP real de 3.9; aiDraft se valida por separado con el contrato 3.13. */
export interface CycleClosing {
  cycleId: string;
  revision: number;
  reviewedAt: string;
  publishedAt: string | null;
  professionalNotes: string | null;
  patientMessage: { es: string | null; en: string | null };
  criticalAlertsConfirmed: boolean;
  aiDraftConfirmed: boolean;
  summary: unknown;
  aiDraft: unknown | null;
  attachments: CycleClosingAttachment[];
}
export interface CycleClosingAttachment {
  id: string;
  kind: "image" | "document";
  caption: string | null;
  visibleToPatient: boolean;
  url: string | null;
}
export interface CycleClosingFields {
  professionalNotes: string;
  patientMessage: { es: string; en: string };
  criticalAlertsConfirmed: boolean;
  aiDraftConfirmed: boolean;
}
const root = (id: string) =>
  `/api/v1/nutrition/cycles/${encodeURIComponent(id)}`;
const revision = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;
function attachment(row: CycleClosingAttachment) {
  if (
    !row ||
    typeof row.id !== "string" ||
    !["image", "document"].includes(row.kind) ||
    !(row.caption === null || typeof row.caption === "string") ||
    typeof row.visibleToPatient !== "boolean" ||
    !(
      row.url === null ||
      (typeof row.url === "string" &&
        /^(https?:\/\/|\/api\/v1\/nutrition\/attachments\/)/.test(row.url))
    )
  )
    throw Error("attachment-contract");
  return row;
}
function closing(value: CycleClosing, id: string) {
  if (
    !value ||
    value.cycleId !== id ||
    !revision(value.revision) ||
    !Number.isFinite(Date.parse(value.reviewedAt)) ||
    !(
      value.publishedAt === null ||
      Number.isFinite(Date.parse(value.publishedAt))
    ) ||
    !(
      value.professionalNotes === null ||
      typeof value.professionalNotes === "string"
    ) ||
    !value.patientMessage ||
    ![value.patientMessage.es, value.patientMessage.en].every(
      (s) => s === null || typeof s === "string",
    ) ||
    typeof value.criticalAlertsConfirmed !== "boolean" ||
    typeof value.aiDraftConfirmed !== "boolean" ||
    !("summary" in value) ||
    !("aiDraft" in value) ||
    !Array.isArray(value.attachments)
  )
    throw Error("closing-contract");
  value.attachments.forEach(attachment);
  return value;
}
async function request<T>(
  path: string,
  signal: AbortSignal,
  map: (wire: T) => T,
  method = "GET",
  body?: BodyInit,
): Promise<T> {
  try {
    const wire = await apiFetch<T>(env.apiUrl + path, {
      method,
      signal,
      body,
      cache: "no-store",
      timeoutMs: 120000,
    });
    try {
      return map(wire);
    } catch {
      throw new NutritionRequestError({
        kind: "contract",
        endpoint: `${method} ${path.split("?")[0]}`,
        status: 502,
      });
    }
  } catch (error) {
    if (error instanceof NutritionRequestError) throw error;
    const status = error instanceof ApiError ? error.status : 0;
    throw new NutritionRequestError({
      kind: status === 409 ? "conflict" : "request",
      endpoint: `${method} ${path.split("?")[0]}`,
      status,
      detail: error instanceof ApiError ? error.message : undefined,
    });
  }
}
export const fetchCycleClosing = (id: string, signal: AbortSignal) =>
  request<CycleClosing | null>(root(id) + "/review", signal, (v) =>
    v == null ? null : closing(v, id),
  );
export const saveCycleClosing = (
  id: string,
  rev: number,
  fields: CycleClosingFields,
  signal: AbortSignal,
) =>
  request<CycleClosing>(
    root(id) + "/review",
    signal,
    (v) => {
      closing(v, id);
      if (v.revision !== rev + 1 || v.publishedAt) throw Error("save-revision");
      return v;
    },
    "POST",
    JSON.stringify({ revision: rev, ...fields }),
  );
export const publishCycleClosing = (
  id: string,
  rev: number,
  next: { id: string; revision: number },
  signal: AbortSignal,
) =>
  request<CycleClosing>(
    root(id) + "/publish",
    signal,
    (v) => {
      closing(v, id);
      if (!v.publishedAt || v.revision < rev) throw Error("publish-contract");
      return v;
    },
    "POST",
    JSON.stringify({
      revision: rev,
      nextPrescriptionId: next.id,
      nextPrescriptionRevision: next.revision,
    }),
  );
export function uploadCycleAttachment(
  id: string,
  rev: number,
  file: File,
  caption: string,
  visible: boolean,
  signal: AbortSignal,
) {
  const form = new FormData();
  form.set("file", file);
  form.set("revision", String(rev));
  form.set("caption", caption);
  form.set("visibleToPatient", String(visible));
  return request<{ revision: number; attachment: CycleClosingAttachment }>(
    root(id) + "/review/attachments",
    signal,
    (v) => {
      if (!v || v.revision !== rev + 1) throw Error("upload-revision");
      attachment(v.attachment);
      return v;
    },
    "POST",
    form,
  );
}
export const deleteCycleAttachment = (
  id: string,
  rev: number,
  attachmentId: string,
  signal: AbortSignal,
) =>
  request<{ revision: number }>(
    `${root(id)}/review/attachments/${encodeURIComponent(attachmentId)}?revision=${rev}`,
    signal,
    (v) => {
      if (v?.revision !== rev + 1) throw Error("delete-revision");
      return v;
    },
    "DELETE",
  );
export function cycleAttachmentUrl(url: string) {
  return url.startsWith("/") ? env.apiUrl + url : url;
}

/** Contrato 3.13, BACK eb181a8. Los inputs se conservan como trazabilidad, no como datos editables. */
export interface CycleAiDraft {
  status: "ok" | "insufficient";
  summary: string;
  patterns: string[];
  gaps: string[];
  draft: { es: string | null; en: string | null };
  model: string;
  generatedAt: string;
  capturedAt: string;
  inputHash: string;
  inputs: {
    cycleNumber: number;
    startDate: string;
    endDate: string;
    language: "es" | "en";
    aggregates: { daysWithRecords: number; [key: string]: number | null };
    records: unknown[];
    [key: string]: unknown;
  };
}
export function parseCycleAiDraft(value: unknown): CycleAiDraft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as CycleAiDraft;
  if (
    !["ok", "insufficient"].includes(v.status) ||
    typeof v.summary !== "string" ||
    ![v.patterns, v.gaps].every(
      (a) => Array.isArray(a) && a.every((s) => typeof s === "string"),
    ) ||
    !v.draft ||
    ![v.draft.es, v.draft.en].every(
      (s) => s === null || typeof s === "string",
    ) ||
    typeof v.model !== "string" ||
    ![v.generatedAt, v.capturedAt].every(
      (d) => typeof d === "string" && Number.isFinite(Date.parse(d)),
    ) ||
    typeof v.inputHash !== "string" ||
    !v.inputs ||
    !v.inputs.aggregates ||
    !Number.isInteger(v.inputs.aggregates.daysWithRecords) ||
    !Array.isArray(v.inputs.records) ||
    typeof v.inputs.startDate !== "string" ||
    typeof v.inputs.endDate !== "string"
  )
    return null;
  return v;
}
export function cycleAiRequiresConfirmation(value: unknown) {
  return value != null && parseCycleAiDraft(value)?.status !== "insufficient";
}
export function generateCycleAiDraft(
  id: string,
  rev: number,
  language: "es" | "en",
  signal: AbortSignal,
) {
  return request<{
    status: "ok" | "insufficient" | "unavailable";
    revision: number;
    aiDraft: CycleAiDraft | null;
    warningCode: string | null;
    warning: string | null;
  }>(
    root(id) + "/review/ai-draft",
    signal,
    (v) => {
      if (
        !v ||
        !["ok", "insufficient", "unavailable"].includes(v.status) ||
        v.revision !== rev + (v.status === "unavailable" ? 0 : 1) ||
        !(v.warning === null || typeof v.warning === "string") ||
        !(v.warningCode === null || typeof v.warningCode === "string") ||
        (v.status === "unavailable"
          ? v.aiDraft !== null
          : !parseCycleAiDraft(v.aiDraft) || v.aiDraft?.status !== v.status)
      )
        throw Error("cycle-ai-contract");
      return v;
    },
    "POST",
    JSON.stringify({ revision: rev, language }),
  );
}
