import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import type {
  CreateMedicationEvent,
  CreateMedicationTreatment,
  MedicationCapabilities,
  MedicationDose,
  MedicationPatientPage,
  MedicationOverview,
  MedicationStatus,
  MedicationTreatment,
  MedicationWorkspace,
} from "./types";

const ROOT = "/api/v1/medications/patients";
const patientRoot = (patientId: string) =>
  `${ROOT}/${encodeURIComponent(patientId)}`;

/** Conserva Bearer, refresh y contexto de clínica del cliente HTTP compartido. */
function request<T>(path: string, init: RequestInit = {}) {
  return apiFetch<T>(`${env.apiUrl}${path}`, { ...init, cache: "no-store" });
}

export const fetchMedicationCapabilities = (signal?: AbortSignal) =>
  request<MedicationCapabilities>("/api/v1/me/capabilities", { signal });

export const fetchMedicationOverview = (signal?: AbortSignal) =>
  request<MedicationOverview>("/api/v1/medications/overview", { signal });

export function fetchMedicationPatients(
  query: string,
  page: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    query,
    page: String(page),
    pageSize: "20",
  });
  return request<MedicationPatientPage>(`${ROOT}?${params}`, { signal });
}

export function fetchMedicationWorkspace(
  patientId: string,
  date: string,
  timeZone: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ date, timeZone });
  return request<MedicationWorkspace>(`${patientRoot(patientId)}?${params}`, {
    signal,
  });
}

export const setMedicationAccess = (
  patientId: string,
  enabled: boolean,
  expectedRevision: number,
) =>
  request<{ enabled: boolean; revision: number }>(
    `${patientRoot(patientId)}/access`,
    { method: "PUT", body: JSON.stringify({ enabled, expectedRevision }) },
  );

export const createMedicationTreatment = (
  patientId: string,
  body: CreateMedicationTreatment,
) =>
  request<MedicationTreatment>(`${patientRoot(patientId)}/treatments`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const recordMedicationEvent = (
  patientId: string,
  doseId: string,
  body: CreateMedicationEvent,
) =>
  request<MedicationDose>(
    `${patientRoot(patientId)}/doses/${encodeURIComponent(doseId)}/events`,
    { method: "POST", body: JSON.stringify(body) },
  );

export const setMedicationTreatmentStatus = (
  patientId: string,
  treatmentId: string,
  status: MedicationStatus,
  expectedRevision: number,
) =>
  request<MedicationTreatment>(
    `${patientRoot(patientId)}/treatments/${encodeURIComponent(treatmentId)}/status`,
    { method: "PUT", body: JSON.stringify({ status, expectedRevision }) },
  );
