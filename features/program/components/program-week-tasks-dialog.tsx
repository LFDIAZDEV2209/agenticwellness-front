"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Moon, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n, useT } from "@/providers/i18n-provider";
import {
  useWeekAgendaEditor,
  type SelectedAgendaCell,
} from "../hooks/use-week-agenda-editor";
import { WeekAgendaCellPanel } from "./week-agenda-cell-panel";
import { fetchEnrollmentWeek } from "../services/program-content-service";
import type {
  EnrollmentWeekDay,
  EnrollmentWeekResponse,
  EnrollmentWeekTask,
  ProgramContentWeek,
} from "../types";

const SOURCE_LABELS: Record<string, string> = {
  program: "Del programa",
  template_week: "Del programa",
  template_generic: "Del programa",
  individual: "Personalizado",
  legacy: "Asignación anterior",
  rest: "Descanso",
  // El contrato no distingue la autoría de las rutinas guardadas en snapshot.
  snapshot: "De la semana",
  missing: "Sin contenido",
};

function ContentCell({
  task,
  routine,
  rest = false,
  onSelect,
}: {
  task?: EnrollmentWeekTask;
  routine?: boolean;
  rest?: boolean;
  onSelect?: () => void;
}) {
  const t = useT();
  const missing =
    !rest &&
    (!task ||
      task.source === "missing" ||
      !(task.contentRefId || task.contentName || task.routineId));
  const source = rest
    ? "rest"
    : task?.source === "snapshot" && !routine
      ? "program"
      : (task?.source ?? "");
  const label = SOURCE_LABELS[source] ?? "Origen no informado";
  return (
    <section
      aria-label={routine ? t("Rutina") : t("Podcast")}
      className={`flex min-w-0 flex-col gap-2 rounded-xl border p-3 ${missing ? "border-destructive/40 bg-destructive-soft/20" : rest ? "border-border bg-muted/40" : "border-border bg-background"}`}
    >
      <p className="text-xs font-medium text-muted-foreground">
        {routine ? t("Rutina") : t("Podcast")}
      </p>
      <h4 className="break-words text-sm font-semibold">
        {rest ? (
          <span className="flex items-center gap-2">
            <Moon aria-hidden className="size-4 shrink-0" />
            {t("Descanso")}
          </span>
        ) : missing ? (
          routine ? (
            t("Sin rutina")
          ) : (
            t("Sin podcast")
          )
        ) : (
          task?.contentName || t(task?.taskLabel ?? "Contenido asignado")
        )}
      </h4>
      <Badge
        variant="outline"
        className="h-auto max-w-full self-start whitespace-normal text-xs"
      >
        {t(missing ? "Sin contenido" : label)}
      </Badge>
      {onSelect && (
        <Button
          variant="outline"
          className="min-h-11 whitespace-normal"
          onClick={onSelect}
        >
          {t(routine ? "Editar rutina" : "Editar podcast")}
        </Button>
      )}
      {rest ? (
        <p className="text-xs text-muted-foreground">
          {t("Sin misión de ejercicio")}
        </p>
      ) : (
        task &&
        !missing && (
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {task.status === "completed" && (
              <CheckCircle2 aria-hidden className="size-3.5 text-success" />
            )}
            {task.status === "completed" ? t("Completada") : t("Pendiente")} ·{" "}
            {task.status === "completed" ? task.points : task.scheduledPoints}{" "}
            XP
          </p>
        )
      )}
    </section>
  );
}

function AgendaDay({
  day,
  onSelect,
}: {
  day: EnrollmentWeekDay;
  onSelect?: (cell: SelectedAgendaCell) => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const date = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CO", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day.localDate}T12:00:00Z`));
  const routine = day.tasks.find((task) => task.taskCode === "ejercicio");
  const podcast = day.tasks.find((task) => task.taskCode === "podcast");
  const other = day.tasks.filter(
    (task) => !["ejercicio", "podcast"].includes(task.taskCode),
  );
  return (
    <article
      aria-label={`${t(day.dayLabel)} · ${day.localDate}`}
      className="flex min-w-0 flex-col gap-3 rounded-xl bg-muted/30 p-2"
    >
      <header className="flex flex-col gap-1 px-1 py-2">
        <h3 className="text-sm font-semibold">{t(day.dayLabel)}</h3>
        <time
          dateTime={day.localDate}
          className="text-xs text-muted-foreground"
        >
          {date}
        </time>
      </header>
      <ContentCell
        task={routine}
        routine
        rest={day.rest === true || routine?.rest === true}
        onSelect={
          onSelect
            ? () => onSelect({ weekday: day.weekday, taskCode: "ejercicio" })
            : undefined
        }
      />
      <ContentCell
        task={podcast}
        onSelect={
          onSelect
            ? () => onSelect({ weekday: day.weekday, taskCode: "podcast" })
            : undefined
        }
      />
      {other.length > 0 && (
        <details className="rounded-lg px-1 text-xs">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            {t("Otras tareas")} ({other.length})
          </summary>
          <ul className="flex flex-col gap-2 py-2">
            {other.map((task) => (
              <li key={task.taskCode} className="break-words">
                {t(task.taskLabel)} ·{" "}
                {task.status === "completed" ? t("Completada") : t("Pendiente")}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-auto border-t border-border px-1 pt-2 text-xs tabular-nums text-muted-foreground">
        {t("Total")}: {day.totalPoints}/{day.maxPoints} XP
      </p>
    </article>
  );
}

interface WeekTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  week: ProgramContentWeek;
  enrollmentId: string;
  onChanged?: () => void;
}

/** Agenda semanal con edición parcial por celda; el backend decide el bloqueo. */
export function WeekTasksDialog({
  open,
  onOpenChange,
  week,
  enrollmentId,
  onChanged,
}: WeekTasksDialogProps) {
  const t = useT();
  const key = `${enrollmentId}:${week.weekNumber}`;
  const [reload, setReload] = useState(0);
  const [resource, setResource] = useState<{
    key: string;
    data: EnrollmentWeekResponse | null;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResource(null);
      void fetchEnrollmentWeek(enrollmentId, week.weekNumber, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted)
            setResource({ key, data, error: false });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResource({ key, data: null, error: true });
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, enrollmentId, week.weekNumber, key, reload]);
  const current = resource?.key === key ? resource : null;
  const editor = useWeekAgendaEditor({
    open,
    enrollmentId,
    weekNumber: week.weekNumber,
    data: current?.data ?? null,
    onData: (data) => {
      setResource({ key, data, error: false });
      onChanged?.();
    },
  });
  const changeOpen = (next: boolean) => {
    if (editor.saving) return;
    if (!next) setResource(null);
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent size="xl" className="gap-0 overflow-hidden p-0">
        <DialogHeader className="rounded-none border-0 border-b border-border bg-transparent px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays aria-hidden className="size-5 text-primary" />
            {t("Semana {week}", { week: String(week.weekNumber) })}
          </DialogTitle>
          <DialogDescription>
            {t(editor.canEdit ? "Agenda semanal" : "Agenda en solo lectura")} ·{" "}
            {week.weekStartDateLocal} — {week.weekEndDateLocal}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4" aria-busy={!current}>
          {!current ? (
            <div
              aria-label={t("Cargando agenda")}
              role="status"
              className="grid grid-cols-1 gap-3 md:grid-cols-7"
            >
              {Array.from({ length: 7 }, (_, index) => (
                <Skeleton key={index} className="h-52 rounded-xl" />
              ))}
            </div>
          ) : current.error ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-xl bg-destructive-soft/30 p-5"
            >
              <p className="text-sm font-semibold">
                {t("No pudimos cargar la agenda")}
              </p>
              <Button
                variant="outline"
                onClick={() => setReload((value) => value + 1)}
              >
                <RefreshCw aria-hidden />
                {t("Reintentar")}
              </Button>
            </div>
          ) : current.data && current.data.days.length > 0 ? (
            <div
              aria-label={t("Agenda semanal")}
              className="grid grid-cols-1 gap-3 md:grid-cols-7"
            >
              {current.data.days.map((day) => (
                <AgendaDay
                  key={day.localDate}
                  day={day}
                  onSelect={editor.canEdit ? editor.select : undefined}
                />
              ))}
            </div>
          ) : (
            <p
              role="status"
              className="py-10 text-center text-sm text-muted-foreground"
            >
              {t("Sin tareas configuradas para esta semana")}
            </p>
          )}
        </DialogBody>
        <DialogFooter className="m-0 rounded-none px-6 py-4">
          {!editor.selected && editor.saved && (
            <div
              role="status"
              className="mr-auto flex items-center gap-2 text-sm"
            >
              {t("Cambio guardado")}
              {editor.undo && (
                <Button
                  variant="outline"
                  disabled={editor.saving}
                  onClick={editor.undoChange}
                >
                  {t("Deshacer")}
                </Button>
              )}
            </div>
          )}
          <Button
            variant="outline"
            disabled={editor.saving}
            onClick={() => changeOpen(false)}
          >
            {t("Cerrar")}
          </Button>
        </DialogFooter>
        {editor.selected && current?.data && (
          <WeekAgendaCellPanel
            key={`${editor.selected.weekday}:${editor.selected.taskCode}`}
            editor={editor}
            data={current.data}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
