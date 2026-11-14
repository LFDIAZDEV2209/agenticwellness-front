"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/http";
import { PROGRAM_REST_DAYS_ENABLED } from "@/lib/config/feature-visibility";
import { useAuth } from "@/providers/auth-provider";
import { fetchEnrollmentById } from "../services/program-enrollments-service";
import { getProgramTemplate } from "../services/program-templates-service";
import {
  fetchEnrollmentWeek,
  replaceEnrollmentWeekTasks,
} from "../services/program-content-service";
import type {
  EnrollmentWeekDay,
  EnrollmentWeekResponse,
  ProgramEnrollment,
  ProgramTemplate,
} from "../types";

export type AgendaTaskCode = "ejercicio" | "podcast";
export type CellChange = Parameters<
  typeof replaceEnrollmentWeekTasks
>[2][number];
export type SelectedAgendaCell = { weekday: number; taskCode: AgendaTaskCode };

export function agendaCell(day: EnrollmentWeekDay, taskCode: AgendaTaskCode) {
  return day.tasks.find((task) => task.taskCode === taskCode);
}

/** Compara solo las celdas tocadas, sin tratar los totales como control de versión. */
export function sameAgendaCells(
  a: EnrollmentWeekResponse,
  b: EnrollmentWeekResponse,
  changes: CellChange[],
) {
  return changes.every((change) => {
    const value = (week: EnrollmentWeekResponse) => {
      const day = week.days.find((d) => d.weekday === change.weekday);
      const task = day?.tasks.find((t) => t.taskCode === change.taskCode);
      return [
        day?.localDate,
        change.taskCode === "ejercicio" && day?.rest === true,
        task?.rest,
        task?.contentRefId,
        task?.routineId,
        task?.source,
        task?.scheduledPoints,
        task?.status,
      ];
    };
    return JSON.stringify(value(a)) === JSON.stringify(value(b));
  });
}

export function useWeekAgendaEditor({
  open,
  enrollmentId,
  weekNumber,
  data,
  onData,
}: {
  open: boolean;
  enrollmentId: string;
  weekNumber: number;
  data: EnrollmentWeekResponse | null;
  onData: (data: EnrollmentWeekResponse) => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("Program.Edit");
  const [selected, setSelected] = useState<SelectedAgendaCell | null>(null);
  const [context, setContext] = useState<{
    id: string;
    enrollment: ProgramEnrollment;
    template: ProgramTemplate;
  } | null>(null);
  const [contextError, setContextError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [undo, setUndo] = useState<{
    changes: CellChange[];
    expected: EnrollmentWeekResponse;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open || !canEdit) return;
    let cancelled = false;
    void fetchEnrollmentById(enrollmentId)
      .then(async (enrollment) => {
        const template = await getProgramTemplate(enrollment.templateId);
        if (!cancelled) {
          setContext({ id: enrollmentId, enrollment, template });
          setContextError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setContextError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, canEdit, enrollmentId, attempt]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const active = context?.id === enrollmentId ? context : null;
  const defaults = (weekday: number, code: AgendaTaskCode) => {
    const rows =
      active?.template.days.filter(
        (row) => row.weekday === weekday && row.taskCode === code,
      ) ?? [];
    return (
      rows.find((row) => row.weekNumber === weekNumber) ??
      rows.find((row) => row.weekNumber == null)
    );
  };
  let editable = false;
  if (active && data && !locked) {
    const { enrollment } = active;
    const start = new Date(`${enrollment.startLocalDate}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() + (weekNumber - 1) * 7);
    try {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: enrollment.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      editable =
        start.toISOString().slice(0, 10) >= today &&
        weekNumber >= enrollment.currentWeekNumber &&
        !data.days.some((day) =>
          day.tasks.some(
            (task) => task.status === "completed" || task.completedAt,
          ),
        );
    } catch {
      /* Zona no válida: conservar lectura; la API sigue siendo autoridad. */
    }
  }
  const rowFor = (
    day: EnrollmentWeekDay,
    code: AgendaTaskCode,
  ): CellChange => ({
    weekday: day.weekday,
    taskCode: code,
    points:
      agendaCell(day, code)?.scheduledPoints ??
      defaults(day.weekday, code)?.points ??
      0,
    sortOrder:
      defaults(day.weekday, code)?.sortOrder ??
      Math.max(
        0,
        day.tasks.findIndex((task) => task.taskCode === code),
      ),
  });
  const inverse = (
    day: EnrollmentWeekDay,
    code: AgendaTaskCode,
  ): CellChange | null => {
    const row = rowFor(day, code),
      task = agendaCell(day, code);
    if (code === "ejercicio" && (day.rest || task?.rest))
      return PROGRAM_REST_DAYS_ENABLED ? { ...row, rest: true } : null;
    if (
      ["program", "template_week", "template_generic"].includes(
        task?.source ?? "",
      ) &&
      defaults(day.weekday, code)
    )
      return { ...row, reset: true };
    const id =
      task?.contentRefId ?? (code === "ejercicio" ? task?.routineId : null);
    return id
      ? {
          ...row,
          ...(code === "ejercicio" ? { routineId: id } : { mediaId: id }),
        }
      : null;
  };
  const apply = async (changes: CellChange[], undoing = false) => {
    if (
      !data ||
      busy.current ||
      !canEdit ||
      !editable ||
      changes.some((row) => row.rest && !PROGRAM_REST_DAYS_ENABLED)
    )
      return;
    busy.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    const expected = undoing ? undo?.expected : data;
    const prior = changes.map((change) => {
      const day = data.days.find((day) => day.weekday === change.weekday);
      return day ? inverse(day, change.taskCode as AgendaTaskCode) : null;
    });
    try {
      const fresh = await fetchEnrollmentWeek(enrollmentId, weekNumber);
      if (!expected || !sameAgendaCells(expected, fresh, changes)) {
        onData(fresh);
        setUndo(null);
        setError(
          "Esto cambió hace un momento. Revisa la agenda antes de reintentar.",
        );
        return;
      }
      const updated = await replaceEnrollmentWeekTasks(
        enrollmentId,
        weekNumber,
        changes,
      );
      onData(updated);
      setSaved(true);
      setUndo(
        !undoing && prior.every((row): row is CellChange => row !== null)
          ? { changes: prior, expected: updated }
          : null,
      );
      timer.current = setTimeout(() => {
        setUndo(null);
        setSaved(false);
      }, 8000);
    } catch (err) {
      setUndo(null);
      setSaved(false);
      if (err instanceof ApiError && err.status === 409) {
        setLocked(true);
        setError("Esta semana ya empezó; no se puede modificar.");
      } else if (
        err instanceof ApiError &&
        err.status === 422 &&
        err.message.includes("REST_DAYS_DISABLED")
      )
        setError("El descanso aún no está habilitado.");
      else
        setError(
          "No se pudo guardar el cambio. Recarga la agenda antes de reintentar.",
        );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return {
    canEdit,
    selected,
    select: (cell: SelectedAgendaCell | null) => {
      if (!busy.current) {
        setSelected(cell);
        setError(null);
      }
    },
    context: active,
    contextError,
    retryContext: () => setAttempt((value) => value + 1),
    editable,
    saving,
    error,
    saved,
    undo,
    restEnabled: PROGRAM_REST_DAYS_ENABLED,
    rowFor,
    defaults,
    inverse,
    apply,
    undoChange: () => undo && void apply(undo.changes, true),
  };
}
