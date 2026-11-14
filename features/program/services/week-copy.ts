import type {
  EnrollmentWeekResponse,
  ProgramEnrollment,
  ProgramTemplate,
} from "../types";
import {
  agendaCell,
  type AgendaTaskCode,
  type CellChange,
} from "../hooks/use-week-agenda-editor";

export type WeekCopyKind = "routines" | "podcasts" | "all";
export function weekHasStarted(
  enrollment: ProgramEnrollment,
  week: number,
  detail?: EnrollmentWeekResponse,
) {
  const start = new Date(`${enrollment.startLocalDate}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
  try {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: enrollment.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return (
      start.toISOString().slice(0, 10) < today ||
      week < enrollment.currentWeekNumber ||
      !!detail?.days.some((day) =>
        day.tasks.some(
          (task) => task.status === "completed" || task.completedAt,
        ),
      )
    );
  } catch {
    return true;
  }
}

/** Copia referencias, nunca huecos ni fechas que no existen en la semana destino. */
export function planWeekCopy(
  source: EnrollmentWeekResponse,
  target: EnrollmentWeekResponse,
  template: ProgramTemplate,
  kind: WeekCopyKind,
  restEnabled: boolean,
) {
  const codes: AgendaTaskCode[] =
    kind === "routines"
      ? ["ejercicio"]
      : kind === "podcasts"
        ? ["podcast"]
        : ["ejercicio", "podcast"];
  const changes: CellChange[] = [],
    inverse: CellChange[] = [];
  let empty = 0,
    disabledRest = 0,
    unavailableUndo = 0;
  for (const day of source.days) {
    const destination = target.days.find(
      (other) => other.weekday === day.weekday,
    );
    if (!destination) continue;
    for (const code of codes) {
      const task = agendaCell(day, code),
        prior = agendaCell(destination, code);
      const rest = code === "ejercicio" && (day.rest || task?.rest);
      const id =
        task?.contentRefId ?? (code === "ejercicio" ? task?.routineId : null);
      if (rest && !restEnabled) {
        disabledRest++;
        continue;
      }
      if (!rest && (!id || task?.source === "missing")) {
        empty++;
        continue;
      }
      const defaults = template.days.filter(
        (row) => row.weekday === destination.weekday && row.taskCode === code,
      );
      const fallback =
        defaults.find((row) => row.weekNumber === target.weekNumber) ??
        defaults.find((row) => row.weekNumber == null);
      const row = {
        weekday: destination.weekday,
        taskCode: code,
        points:
          prior?.scheduledPoints ??
          fallback?.points ??
          task?.scheduledPoints ??
          0,
        sortOrder: fallback?.sortOrder ?? 0,
      };
      // Si descanso está apagado, no pisar uno existente que luego no se podría reponer.
      if (
        code === "ejercicio" &&
        (destination.rest || prior?.rest) &&
        !restEnabled
      ) {
        disabledRest++;
        continue;
      }
      changes.push({
        ...row,
        ...(rest
          ? { rest: true }
          : code === "ejercicio"
            ? { routineId: id }
            : { mediaId: id }),
      });
      if (code === "ejercicio" && (destination.rest || prior?.rest))
        inverse.push({ ...row, rest: true });
      else if (
        ["program", "template_week", "template_generic"].includes(
          prior?.source ?? "",
        ) &&
        fallback
      )
        inverse.push({ ...row, reset: true });
      else {
        const priorId =
          prior?.contentRefId ??
          (code === "ejercicio" ? prior?.routineId : null);
        if (priorId)
          inverse.push({
            ...row,
            ...(code === "ejercicio"
              ? { routineId: priorId }
              : { mediaId: priorId }),
          });
        else unavailableUndo++;
      }
    }
  }
  return { changes, inverse, empty, disabledRest, unavailableUndo };
}
