import { apiFetch, ApiError } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import type {
  ProgramTemplate,
  ProgramTemplateListItem,
  ProgramTemplateFilters,
  CreateTemplateInput,
  UpdateTemplateInput,
  WeeklyDayTask,
  WeeklyDayTaskInput,
  PaginatedResult,
} from "../types";

const PATH = `${env.apiUrl}/api/v1/program/templates`;

// --- Listado paginado ---

export async function fetchProgramTemplates(
  page: number,
  pageSize: number,
  filters: ProgramTemplateFilters,
  signal?: AbortSignal,
): Promise<PaginatedResult<ProgramTemplateListItem>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  const search = filters.search.trim();
  if (search) params.set("search", search);
  if (filters.status !== "all") params.set("status", filters.status);

  return apiFetch<PaginatedResult<ProgramTemplateListItem>>(
    `${PATH}?${params.toString()}`,
    { signal },
  );
}

// --- Detalle ---

export async function getProgramTemplate(id: string): Promise<ProgramTemplate> {
  return apiFetch<ProgramTemplate>(`${PATH}/${id}`);
}

// --- CRUD ---

export async function createProgramTemplate(
  input: CreateTemplateInput,
): Promise<ProgramTemplate> {
  return apiFetch<ProgramTemplate>(PATH, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProgramTemplate(
  id: string,
  input: UpdateTemplateInput,
): Promise<ProgramTemplate> {
  return apiFetch<ProgramTemplate>(`${PATH}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// --- Publicar / Archivar ---

export interface TemplateImpact {
  pacientesQueCambian: number;
  conPersonalizacionesFuturas: number;
  semanasOmitidasIniciadas: number;
  /** Ampliación de lectura pendiente del backend; ausencia no significa cero huecos. */
  huecos?: TemplateDayGap[];
}

export interface TemplateDayGap {
  day: number;
  weekNumber: number;
  weekday: number;
  taskCode: string;
}

export async function previewProgramTemplateImpact(
  id: string,
  signal?: AbortSignal,
): Promise<TemplateImpact> {
  const impact = await apiFetch<TemplateImpact>(
    `${PATH}/${id}/publish?preview=true`,
    {
      method: "POST",
      signal,
    },
  );
  if (
    ![
      impact.pacientesQueCambian,
      impact.conPersonalizacionesFuturas,
      impact.semanasOmitidasIniciadas,
    ].every((value) => Number.isInteger(value) && value >= 0)
  ) {
    throw new Error("Invalid template impact response");
  }
  if (
    impact.huecos !== undefined &&
    (!Array.isArray(impact.huecos) ||
      impact.huecos.some(
        (gap) =>
          !gap ||
          !Number.isInteger(gap.day) ||
          gap.day < 1 ||
          gap.day > 83 ||
          !Number.isInteger(gap.weekNumber) ||
          gap.weekNumber < 1 ||
          gap.weekNumber > 12 ||
          !Number.isInteger(gap.weekday) ||
          gap.weekday < 1 ||
          gap.weekday > 7 ||
          typeof gap.taskCode !== "string",
      ))
  )
    throw new Error("Invalid template gaps response");
  return impact;
}

/** La lista procede del 422 de publicación; no se deduce del editor de podcasts. */
export function templateContentGaps(error: unknown): TemplateDayGap[] {
  if (!(error instanceof ApiError) || error.status !== 422) return [];
  const gaps = error.extensions?.gaps;
  if (!Array.isArray(gaps)) return [];
  return gaps.filter(
    (gap): gap is TemplateDayGap =>
      typeof gap === "object" &&
      gap !== null &&
      Number.isInteger(gap.day) &&
      gap.day >= 1 &&
      gap.day <= 83 &&
      Number.isInteger(gap.weekNumber) &&
      gap.weekNumber >= 1 &&
      gap.weekNumber <= 12 &&
      Number.isInteger(gap.weekday) &&
      gap.weekday >= 1 &&
      gap.weekday <= 7 &&
      typeof gap.taskCode === "string",
  );
}

export async function publishProgramTemplate(
  id: string,
): Promise<ProgramTemplate> {
  return apiFetch<ProgramTemplate>(`${PATH}/${id}/publish`, {
    method: "POST",
  });
}

export async function archiveProgramTemplate(
  id: string,
): Promise<ProgramTemplate> {
  return apiFetch<ProgramTemplate>(`${PATH}/${id}/archive`, {
    method: "POST",
  });
}

// --- Tareas por día ---

export async function getWeekdayTasks(id: string): Promise<WeeklyDayTask[]> {
  return apiFetch<WeeklyDayTask[]>(`${PATH}/${id}/weekday-tasks`);
}

export async function replaceWeekdayTasks(
  id: string,
  tasks: WeeklyDayTaskInput[],
  weekNumber?: number,
): Promise<WeeklyDayTask[]> {
  const query = weekNumber === undefined ? "" : `?weekNumber=${weekNumber}`;
  return apiFetch<WeeklyDayTask[]>(`${PATH}/${id}/weekday-tasks${query}`, {
    method: "PUT",
    body: JSON.stringify(tasks),
  });
}

// --- Constantes ---

export const TEMPLATE_STATUSES: Array<"Draft" | "Active" | "Archived"> = [
  "Draft",
  "Active",
  "Archived",
];

export const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  Draft: "Borrador",
  Active: "Activo",
  Archived: "Archivado",
};

export const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "Draft", label: "Borrador" },
  { value: "Active", label: "Activo" },
  { value: "Archived", label: "Archivado" },
] as const;

/** Códigos de tarea disponibles para las filas del horario semanal. */
export const TASK_CODE_OPTIONS = [
  { value: "podcast", label: "Podcast" },
  { value: "vitals", label: "Signos vitales" },
  { value: "nut", label: "Plan nutricional" },
  { value: "ejercicio", label: "Ejercicio" },
  { value: "nutraceutico", label: "Nutracéutico" },
  { value: "emocional", label: "Evaluación emocional" },
] as const;

/** Nombres de los días de la semana (index 0 = lunes). */
export const WEEKDAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
