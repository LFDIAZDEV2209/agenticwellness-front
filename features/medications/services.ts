import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import type {
  CreateMedicationEvent,
  CreateMedicationTreatment,
  MedicationCapabilities,
  MedicationAdherenceSummary,
  UpdateMedicationRegimen,
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

export const fetchMedicationVersion = (patientId: string, signal?: AbortSignal) =>
  request<string>(`${patientRoot(patientId)}/version`, { signal });

export const fetchMedicationAdherence = (patientId: string, timeZone: string, signal?: AbortSignal) =>
  request<MedicationAdherenceSummary>(`${patientRoot(patientId)}/adherence?${new URLSearchParams({ timeZone })}`, { signal });

export const updateMedicationRegimen = (patientId: string, treatmentId: string, body: UpdateMedicationRegimen) =>
  request<MedicationTreatment>(`${patientRoot(patientId)}/treatments/${encodeURIComponent(treatmentId)}`,
    { method: "PUT", body: JSON.stringify(body) });

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
  reason?: string,
) =>
  request<MedicationTreatment>(
    `${patientRoot(patientId)}/treatments/${encodeURIComponent(treatmentId)}/status`,
    { method: "PUT", body: JSON.stringify({ status, expectedRevision, reason }) },
  );

export type RxTermsOption = {
  id: string;
  name: string;
  strength?: string | null;
  doseForm?: string | null;
  route?: string | null;
  doseUnit?: string | null;
  dosage?: number | null;
};

export function searchUsMedicationCatalog(search: string, signal: AbortSignal) {
  return request<RxTermsOption[]>(
    `/api/v1/medications/catalog/us?${new URLSearchParams({ search })}`,
    { signal },
  );
}

export const fetchMedicationWeek = (patientId:string, from:string, timeZone:string, signal?:AbortSignal) =>
  request<import('./monitoring-types').MedicationWeek>(`${patientRoot(patientId)}/tracking?${new URLSearchParams({from,timeZone})}`,{signal});
export const fetchMedicationInventory = (query:string,page:number,patientId?:string,signal?:AbortSignal) =>
  request<import('./monitoring-types').MedicationPage<import('./monitoring-types').MedicationSupply>>(`/api/v1/medications/inventory?${new URLSearchParams({query,page:String(page),pageSize:'20',...(patientId?{patientId}:{})})}`,{signal});
export const fetchPatientInventory = (patientId:string,signal?:AbortSignal) =>
  request<import('./monitoring-types').MedicationPage<import('./monitoring-types').MedicationSupply>>(`${patientRoot(patientId)}/inventory`,{signal});
export const saveMedicationStock = (patientId:string,treatmentId:string,body:import('./monitoring-types').StockRequest) =>
  request<import('./monitoring-types').MedicationSupply>(`${patientRoot(patientId)}/inventory/${encodeURIComponent(treatmentId)}/movements`,{method:'POST',body:JSON.stringify(body)});
export const fetchMedicationMovements = (patientId:string,treatmentId:string,signal?:AbortSignal) =>
  request<import('./monitoring-types').StockMovement[]>(`${patientRoot(patientId)}/inventory/${encodeURIComponent(treatmentId)}/movements`,{signal});
export const fetchMedicationEffects = (patientId:string,signal?:AbortSignal) =>
  request<import('./monitoring-types').MedicationEffect[]>(`${patientRoot(patientId)}/effects`,{signal});
export const reviewMedicationEffect = (patientId:string,id:string,body:import('./monitoring-types').FollowUpRequest) =>
  request<import('./monitoring-types').MedicationEffect>(`${patientRoot(patientId)}/effects/${encodeURIComponent(id)}/follow-ups`,{method:'POST',body:JSON.stringify(body)});
export const fetchMedicationAlerts = (status:string,kind:string,page:number,signal?:AbortSignal) =>
  request<import('./monitoring-types').MedicationPage<import('./monitoring-types').MedicationAlert>>(`/api/v1/medications/alerts?${new URLSearchParams({status,kind,page:String(page),pageSize:'20'})}`,{signal});
export const followMedicationAlert = (patientId:string,id:string,body:import('./monitoring-types').FollowUpRequest) =>
  request<import('./monitoring-types').MedicationAlert>(`${patientRoot(patientId)}/alerts/${encodeURIComponent(id)}/follow-ups`,{method:'POST',body:JSON.stringify(body)});
export const fetchMedicationAudit = (filters:Record<string,string>,page:number,signal?:AbortSignal) =>
  request<import('./monitoring-types').MedicationPage<import('./monitoring-types').MedicationAudit>>(`/api/v1/medications/audit?${new URLSearchParams({...filters,page:String(page),pageSize:'30'})}`,{signal});
export const fetchMedicationExport = (patientId:string,from:string,timeZone:string,purpose:string) =>
  request<string>(`${patientRoot(patientId)}/export?${new URLSearchParams({from,timeZone,purpose})}`);
