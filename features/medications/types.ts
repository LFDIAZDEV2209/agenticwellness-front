export type MedicationStatus = "active" | "paused" | "completed";
export type DoseStatus = "pending" | "taken" | "omitted" | "cancelled";
export type MedicationProductType = "medication" | "vitamin" | "supplement";

export interface MedicationCapability {
  enabled: boolean;
  canView: boolean;
  canManage: boolean;
  canManageAccess: boolean;
  canViewAudit?: boolean;
  canExport?: boolean;
}

export interface MedicationCapabilities {
  policyVersion: string;
  modules: { medications: MedicationCapability };
}

export interface MedicationReminderOverrides {
  push?: boolean | null;
  inApp?: boolean | null;
  whatsApp?: boolean | null;
  leadMinutes?: number | null;
  followUpMinutes?: number | null;
}

export type MedicationChannel = "app" | "erp" | "whatsapp" | "vita_chat" | "vita_voice";
export const medicationChannelLabels = {
  app: "App", erp: "ERP", whatsapp: "WhatsApp", vita_chat: "Vita · Chat", vita_voice: "Vita · Voz",
} as const;

export interface MedicationTreatment {
  id: string;
  medicationId: string | null;
  rxCui?: string;
  name: string;
  productType: MedicationProductType;
  status: MedicationStatus;
  origin: "patient_reported" | "staff_recorded" | "legacy_import";
  revision: number;
  createdAt: string;
  isRequired?: boolean;
  prescriber?: string | null;
  dosage: number;
  unit: string;
  route: string;
  instructions: string;
  times: string[];
  timeZone: string;
  startDate: string;
  endDate: string | null;
  weekdayMask?: number | null;
  intervalHours?: number | null;
  reminders?: MedicationReminderOverrides;
}

export interface MedicationDose {
  id: string;
  treatmentId: string;
  name: string;
  dosage: number;
  unit: string;
  scheduledAt: string;
  timeZone: string;
  status: DoseStatus;
  occurredAt: string | null;
  channel?: MedicationChannel | null;
  revision: number;
}

export interface MedicationEvent {
  id: string;
  doseId: string;
  treatmentId: string;
  name: string;
  status: "taken" | "omitted" | "pending";
  occurredAt: string;
  recordedAt: string;
  reason: string | null;
  channel?: MedicationChannel | null;
  origin: "patient_reported" | "staff_recorded";
}

export function isRequiredMedication(treatment: MedicationTreatment): boolean {
  return treatment.isRequired ?? (treatment.origin === "staff_recorded" && treatment.productType !== "supplement");
}

export interface MedicationAdherence {
  scheduledDoses: number;
  dueDoses: number;
  takenDoses: number;
  omittedDoses: number;
  unrecordedDoses: number;
  percent: number | null;
  offPlanTakenDoses: number;
}

export interface MedicationWorkspace {
  version?: string;
  patient: { id: string; name: string; mrn: string };
  access: { enabled: boolean; revision: number };
  treatments: MedicationTreatment[];
  doses: MedicationDose[];
  history: MedicationEvent[];
  adherence?: MedicationAdherence | null;
  summary: {
    activeTreatments: number;
    scheduledDoses: number;
    takenDoses: number;
    pendingDoses: number;
  };
}

export interface MedicationOverview {
  totalPatients: number;
  enabledPatients: number;
  patientsWithActiveTreatments: number;
  activeTreatments: number;
  takenToday: number;
  periodStart: string;
  periodEnd: string;
  activity: { date: string; taken: number; omitted: number }[];
}

export interface MedicationPatient {
  patientId: string;
  name: string;
  mrn: string;
  enabled: boolean;
  activeTreatments: number;
}

export interface MedicationPatientPage {
  items: MedicationPatient[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateMedicationTreatment {
  clientRequestId: string;
  rxCui?: string;
  medicationId: string | null;
  name: string;
  productType: MedicationProductType;
  dosage: number;
  unit: string;
  route: string;
  instructions: string;
  times: string[];
  timeZone: string;
  startDate: string;
  endDate: string | null;
  weekdayMask?: number | null;
  intervalHours?: number | null;
  reminders?: MedicationReminderOverrides;
}

export interface CreateMedicationEvent {
  scheduledAt?: string;
  clientRequestId: string;
  status: "taken" | "omitted";
  occurredAt?: string;
  reason?: string | null;
  expectedRevision: number;
}


export type UpdateMedicationRegimen = Omit<CreateMedicationTreatment, "clientRequestId" | "medicationId" | "name" | "productType" | "rxCui"> & { expectedRevision: number };

export interface MedicationAdherenceWindow {
  due: number;
  taken: number;
  percent: number | null;
}
export interface MedicationAdherenceSummary {
  last7Days: MedicationAdherenceWindow;
  last30Days: MedicationAdherenceWindow;
}
