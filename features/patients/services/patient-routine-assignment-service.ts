import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import { canAssignPatientPodcasts, MAX_BULK_PATIENTS } from "./patient-podcast-assignment-service";

export const ROUTINE_PROGRAM_WEEKS = 12;
export interface PatientRoutineAssignment {
  patientIds: string[];
  routineId: string;
  semanaDesde: number;
  semanaHasta: number;
}
/** Pacientes distintos, no semanas; aplicadas e iniciadas pueden solaparse. */
export interface PatientRoutineAssignmentResult {
  aplicadas: number;
  omitidasSemanaIniciada: number;
  omitidasSinAlcance: string[];
}
export const canAssignPatientRoutines = canAssignPatientPodcasts;

export async function assignPatientRoutines(input: PatientRoutineAssignment, signal?: AbortSignal): Promise<PatientRoutineAssignmentResult> {
  const result = await apiFetch<PatientRoutineAssignmentResult>(
    `${env.apiUrl}/api/v1/program/content/bulk-assign-patient-routines`,
    { method: "POST", body: JSON.stringify(input), signal },
  );
  const count = input.patientIds.length;
  if (!result || !Number.isInteger(result.aplicadas) || result.aplicadas < 0 || result.aplicadas > count
    || !Number.isInteger(result.omitidasSemanaIniciada) || result.omitidasSemanaIniciada < 0 || result.omitidasSemanaIniciada > count
    || !Array.isArray(result.omitidasSinAlcance) || result.omitidasSinAlcance.some(id => typeof id !== "string")
    || count > MAX_BULK_PATIENTS) throw new Error("BULK_ROUTINE_RESULT_INVALID");
  const sent = new Set(input.patientIds);
  return { ...result, omitidasSinAlcance: [...new Set(result.omitidasSinAlcance)].filter(id => sent.has(id)) };
}
