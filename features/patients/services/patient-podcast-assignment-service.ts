import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";

export const MAX_BULK_PATIENTS = 100;
export const PODCAST_PROGRAM_WEEKS = 12;

export interface PodcastAssignmentPatient {
  id: string;
  name: string;
}

export interface PatientPodcastAssignment {
  patientIds: string[];
  mediaId: string;
  semanaDesde: number;
  semanaHasta: number;
}

/** Ambos conteos son pacientes distintos y pueden solaparse; no son cantidades de semanas. */
export interface PatientPodcastAssignmentResult {
  aplicadas: number;
  omitidasSemanaIniciada: number;
  omitidasSinAlcance: string[];
}

export function canAssignPatientPodcasts(
  roles: readonly string[],
  canEdit: boolean,
): boolean {
  return (
    canEdit && (roles.includes("Admin") || roles.includes("ClinicalDirector"))
  );
}

export async function assignPatientPodcasts(
  input: PatientPodcastAssignment,
): Promise<PatientPodcastAssignmentResult> {
  return apiFetch<PatientPodcastAssignmentResult>(
    `${env.apiUrl}/api/v1/program/content/bulk-assign-patients`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
