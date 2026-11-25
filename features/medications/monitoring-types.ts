import type { MedicationDose, MedicationTreatment } from "./types";
export interface MedicationPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface MedicationSupply {
  id: string;
  patientId: string;
  patientName: string;
  treatmentId: string;
  name: string;
  unit: string;
  balance: number;
  dailyUsage: number;
  daysRemaining: number | null;
  expiresOn: string | null;
  revision: number;
  tracked: boolean;
}
export interface StockRequest {
  clientRequestId: string;
  kind: "initial" | "refill" | "adjustment";
  quantity: number;
  expectedRevision: number;
  expiresOn: string | null;
  reason: string | null;
}
export interface StockMovement {
  id: string;
  kind: string;
  quantityDelta: number;
  balanceAfter: number;
  reason: string | null;
  recordedAt: string;
  origin: string;
}
export interface EffectFollowUp {
  id: string;
  actorId: string;
  status: string;
  note: string;
  createdAt: string;
}
export interface MedicationEffect {
  id: string;
  patientId: string;
  treatmentId: string | null;
  treatmentName: string | null;
  symptom: string;
  severity: "mild" | "moderate" | "severe";
  status: "open" | "follow_up" | "resolved";
  notes: string | null;
  occurredAt: string;
  createdAt: string;
  revision: number;
  followUps: EffectFollowUp[];
}
export interface EffectRequest {
  clientRequestId: string;
  treatmentId: string | null;
  symptom: string;
  severity: "mild" | "moderate" | "severe";
  notes: string | null;
}
export interface FollowUpRequest {
  clientRequestId: string;
  status: string;
  expectedRevision: number;
  note: string;
}
export interface MedicationAlert {
  id: string;
  patientId: string;
  patientName: string;
  treatmentId: string | null;
  treatmentName: string | null;
  kind: string;
  severity: string;
  status: string;
  conditionActive: boolean;
  assignedTo: string | null;
  resolutionNote: string | null;
  revision: number;
  createdAt: string;
  followUps: {
    id: string;
    actorId: string | null;
    status: string;
    note: string;
    createdAt: string;
  }[];
}
export interface MedicationAudit {
  actorEmail: string | null;
  requestId: string | null;
  id: string;
  patientId: string;
  patientName: string;
  actorId: string | null;
  origin: string;
  action: string;
  resource: string;
  resourceId: string | null;
  purpose: string | null;
  createdAt: string;
}
export interface MedicationTrackingDose {
  dose: MedicationDose;
  localDate: string;
  isRequired: boolean;
  timing: string;
  delayMinutes: number | null;
}
export interface MedicationTrackingDay {
  date: string;
  scheduled: number;
  due: number;
  taken: number;
  omitted: number;
  unrecorded: number;
  percent: number | null;
}
export interface MedicationWeek {
  patient: { id: string; name: string; mrn: string };
  from: string;
  to: string;
  timeZone: string;
  treatments: MedicationTreatment[];
  doses: MedicationTrackingDose[];
  days: MedicationTrackingDay[];
}
export const alertLabels: Record<string, string> = {
  stock_low: "Existencias bajas",
  expired: "Inventario vencido",
  unrecorded: "Toma sin registro",
  low_adherence: "Adherencia baja",
  reported_effect: "Síntoma reportado",
};
export const monitoringStatus: Record<string, string> = {
  open: "Abierto",
  in_progress: "En seguimiento",
  follow_up: "En seguimiento",
  resolved: "Resuelto",
};
export const timingLabels: Record<string, string> = {
  on_time: "A tiempo",
  late: "Tardía",
  omitted: "Omitido",
  unrecorded: "Sin registro",
  pending: "Pendiente",
  cancelled: "Cancelado",
};
export const severityLabels: Record<string, string> = {
  mild: "Leve",
  moderate: "Moderado",
  severe: "Intenso",
  high: "Alta",
  warning: "Media",
};
export const auditLabels: Record<string, string> = {
  read: "Consulta",
  export: "Exportación",
  treatment_created: "Plan de medicación registrado",
  treatment_edited: "Pauta actualizada",
  reminder_preferences_changed: "Preferencias de recordatorio actualizadas",
  treatment_status_changed: "Estado del plan de medicación",
  dose_recorded: "Toma registrada",
  dose_corrected: "Toma corregida",
  stock_initial: "Conteo inicial",
  stock_refill: "Reposición",
  stock_adjustment: "Ajuste de inventario",
  effect_reported: "Síntoma reportado",
  effect_reviewed: "Seguimiento de síntoma",
  alert_created: "Alerta generada",
  alert_reviewed: "Seguimiento de alerta",
  alert_open: "Alerta reabierta",
  alert_resolved: "Alerta resuelta",
  access_changed: "Acceso actualizado",
};
