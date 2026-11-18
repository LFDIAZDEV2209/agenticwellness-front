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
  dosage: number;
  unit: string;
  route: string;
  instructions: string;
  times: string[];
  timeZone: string;
  startDate: string;
  endDate: string | null;
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
  revision: number;
}

export interface MedicationEvent {
  id: string;
  doseId: string;
  treatmentId: string;
  name: string;
  status: "taken" | "omitted";
  occurredAt: string;
  recordedAt: string;
  reason: string | null;
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
}

export interface CreateMedicationEvent {
  scheduledAt?: string;
  clientRequestId: string;
  status: "taken" | "omitted";
  occurredAt?: string;
  reason?: string | null;
  expectedRevision: number;
}
