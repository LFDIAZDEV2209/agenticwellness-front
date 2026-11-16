import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import type {
  ExerciseRoutine,
  ExerciseRoutineListItem,
  ExerciseRoutineFilters,
  CreateExerciseRoutineInput,
  UpdateExerciseRoutineInput,
  PaginatedResult,
  RoutineUsageDto,
} from "../types";

const PATH = `${env.apiUrl}/api/v1/wellness/exercise-routines`;

export async function fetchExerciseRoutines(
  page: number,
  pageSize: number,
  filters: ExerciseRoutineFilters,
  signal?: AbortSignal,
): Promise<PaginatedResult<ExerciseRoutineListItem>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  const search = filters.search.trim();
  if (search) params.set("search", search);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.category !== "all") params.set("category", filters.category);

  return apiFetch<PaginatedResult<ExerciseRoutineListItem>>(
    `${PATH}?${params.toString()}`,
    { signal },
  );
}

export async function getExerciseRoutine(
  id: string,
  signal?: AbortSignal,
): Promise<ExerciseRoutine> {
  return apiFetch<ExerciseRoutine>(`${PATH}/${id}`, { signal });
}

/** Valida el agregado antes de presentar cero o una cifra como datos del servidor. */
export function parseRoutineUsage(value: unknown, routineId: string): RoutineUsageDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ROUTINE_USAGE_INVALID");
  const data = value as Record<string, unknown>;
  if (typeof data.routineId !== "string" || data.routineId.toLowerCase() !== routineId.toLowerCase()
    || [data.patientCount, data.enrollmentCount, data.activeWeekCount].some(count => typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)) {
    throw new Error("ROUTINE_USAGE_INVALID");
  }
  return { routineId: data.routineId, patientCount: data.patientCount as number,
    enrollmentCount: data.enrollmentCount as number, activeWeekCount: data.activeWeekCount as number };
}

export async function getRoutineUsage(id: string, signal?: AbortSignal): Promise<RoutineUsageDto> {
  const data = await apiFetch<unknown>(`${env.apiUrl}/api/v1/program/routines/${id}/usage`, { signal });
  return parseRoutineUsage(data, id);
}

/** Copia de catálogo en borrador; no envía patientId ni crea asignaciones. */
export async function cloneExerciseRoutine(
  id: string,
): Promise<ExerciseRoutine> {
  return apiFetch<ExerciseRoutine>(`${PATH}/${id}/clone`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function createExerciseRoutine(
  input: CreateExerciseRoutineInput,
): Promise<ExerciseRoutine> {
  return apiFetch<ExerciseRoutine>(PATH, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateExerciseRoutine(
  id: string,
  input: UpdateExerciseRoutineInput,
): Promise<ExerciseRoutine> {
  return apiFetch<ExerciseRoutine>(`${PATH}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteExerciseRoutine(id: string): Promise<void> {
  await apiFetch<void>(`${PATH}/${id}`, { method: "DELETE" });
}

// --- Constantes ---

export const DIFFICULTY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Facil", label: "Fácil" },
  { value: "Moderado", label: "Moderado" },
  { value: "Dificil", label: "Difícil" },
];

export const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Fuerza", label: "Fuerza" },
  { value: "Cardio", label: "Cardio" },
  { value: "Flexibilidad", label: "Flexibilidad" },
  { value: "Mixta", label: "Mixta" },
];

export const DIFFICULTY_COLORS: Record<string, string> = {
  Facil: "bg-green-100 text-green-800",
  Moderado: "bg-yellow-100 text-yellow-800",
  Dificil: "bg-red-100 text-red-800",
};

export const CATEGORY_COLORS: Record<string, string> = {
  Fuerza: "bg-blue-100 text-blue-800",
  Cardio: "bg-orange-100 text-orange-800",
  Flexibilidad: "bg-purple-100 text-purple-800",
  Mixta: "bg-gray-100 text-gray-800",
};
