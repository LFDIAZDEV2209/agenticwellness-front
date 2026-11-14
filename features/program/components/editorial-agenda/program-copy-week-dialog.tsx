"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/providers/i18n-provider";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/lib/api/http";
import { PROGRAM_REST_DAYS_ENABLED } from "@/lib/config/feature-visibility";
import {
  fetchEnrollmentWeek,
  replaceEnrollmentWeekTasks,
} from "../../services/program-content-service";
import {
  planWeekCopy,
  weekHasStarted,
  type WeekCopyKind,
} from "../../services/week-copy";
import { sameAgendaCells } from "../../hooks/use-week-agenda-editor";
import type {
  EnrollmentWeekResponse,
  ProgramEnrollment,
  ProgramTemplate,
} from "../../types";

export interface ProgramCopyWeekDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copyWeek: {
    source: EnrollmentWeekResponse;
    enrollment: ProgramEnrollment;
    template: ProgramTemplate;
  };
  onCopied?: () => void;
}
type PlannedWeek = {
  week: number;
  status: "ready" | "started" | "failed";
  before?: EnrollmentWeekResponse;
  plan?: ReturnType<typeof planWeekCopy>;
};
type AppliedWeek = PlannedWeek & { after: EnrollmentWeekResponse };
type CopyResult = {
  applied: AppliedWeek[];
  started: number[];
  failed: number[];
  conflicts: number[];
  undone: number[];
};

export function ProgramCopyWeekDialog({
  open,
  onOpenChange,
  copyWeek,
  onCopied,
}: ProgramCopyWeekDialogProps) {
  const t = useT();
  const { hasPermission } = useAuth();
  const { source, enrollment, template } = copyWeek;
  const [kind, setKind] = useState<WeekCopyKind>("all");
  const [weeks, setWeeks] = useState<number[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{
    key: string;
    items: PlannedWeek[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopyResult | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = `${kind}:${weeks.join(",")}:${attempt}`;
  useEffect(() => {
    if (!open || !hasPermission("Program.Edit")) return;
    const controller = new AbortController();
    void Promise.all(
      weeks.map(async (week): Promise<PlannedWeek> => {
        if (weekHasStarted(enrollment, week))
          return { week, status: "started" };
        try {
          const before = await fetchEnrollmentWeek(
            enrollment.id,
            week,
            controller.signal,
          );
          return weekHasStarted(enrollment, week, before)
            ? { week, status: "started" }
            : {
                week,
                status: "ready",
                before,
                plan: planWeekCopy(
                  source,
                  before,
                  template,
                  kind,
                  PROGRAM_REST_DAYS_ENABLED,
                ),
              };
        } catch {
          return { week, status: "failed" };
        }
      }),
    ).then((items) => {
      if (!controller.signal.aborted) setPreview({ key, items });
    });
    return () => controller.abort();
  }, [open, hasPermission, weeks, enrollment, source, template, kind, key]);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );
  const items = preview?.key === key ? preview.items : null;
  const ready =
    items?.filter(
      (item) => item.status === "ready" && item.plan?.changes.length,
    ) ?? [];
  const started =
    items?.filter((item) => item.status === "started").length ?? 0;
  const empty =
    items?.reduce((sum, item) => sum + (item.plan?.empty ?? 0), 0) ?? 0;
  const disabledRest =
    items?.reduce((sum, item) => sum + (item.plan?.disabledRest ?? 0), 0) ?? 0;
  const unavailableUndo = ready.some((item) => item.plan!.unavailableUndo > 0);
  const copy = async () => {
    if (
      guard.current ||
      !hasPermission("Program.Edit") ||
      !ready.length ||
      !items
    )
      return;
    guard.current = true;
    setBusy(true);
    setError(null);
    const outcome: CopyResult = {
      applied: [],
      started: items
        .filter((item) => item.status === "started")
        .map((item) => item.week),
      failed: items
        .filter((item) => item.status === "failed")
        .map((item) => item.week),
      conflicts: [],
      undone: [],
    };
    try {
      const freshSource = await fetchEnrollmentWeek(
        enrollment.id,
        source.weekNumber,
      );
      const sourceCells = source.days.flatMap((day) =>
        day.tasks
          .filter((task) => ["ejercicio", "podcast"].includes(task.taskCode))
          .map((task) => ({
            weekday: day.weekday,
            taskCode: task.taskCode,
            points: 0,
            sortOrder: 0,
          })),
      );
      // Incluye descanso aunque el GET no lleve misión de ejercicio.
      for (const day of source.days)
        if (day.rest)
          sourceCells.push({
            weekday: day.weekday,
            taskCode: "ejercicio",
            points: 0,
            sortOrder: 0,
          });
      if (!sameAgendaCells(source, freshSource, sourceCells)) {
        setError(
          t(
            "Esto cambió hace un momento. Revisa la agenda antes de reintentar.",
          ),
        );
        return;
      }
      for (const item of ready) {
        try {
          const fresh = await fetchEnrollmentWeek(enrollment.id, item.week);
          if (weekHasStarted(enrollment, item.week, fresh)) {
            outcome.started.push(item.week);
            continue;
          }
          if (!sameAgendaCells(item.before!, fresh, item.plan!.changes)) {
            outcome.conflicts.push(item.week);
            continue;
          }
          const after = await replaceEnrollmentWeekTasks(
            enrollment.id,
            item.week,
            item.plan!.changes,
          );
          outcome.applied.push({ ...item, after });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409)
            outcome.started.push(item.week);
          else outcome.failed.push(item.week);
        }
      }
      setResult(outcome);
      setCanUndo(
        outcome.applied.length > 0 &&
          outcome.applied.every((item) => item.plan!.unavailableUndo === 0),
      );
      undoTimer.current = setTimeout(() => setCanUndo(false), 8000);
      if (outcome.applied.length) onCopied?.();
    } catch {
      setError(t("No se pudo preparar la copia. Vuelve a intentarlo."));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  };
  const undo = async () => {
    if (guard.current || !result || !canUndo || !hasPermission("Program.Edit"))
      return;
    guard.current = true;
    setBusy(true);
    setCanUndo(false);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const undone: number[] = [],
      undoFailed: number[] = [];
    for (const item of result.applied) {
      try {
        const fresh = await fetchEnrollmentWeek(enrollment.id, item.week);
        if (!sameAgendaCells(item.after, fresh, item.plan!.changes)) {
          undoFailed.push(item.week);
          continue;
        }
        await replaceEnrollmentWeekTasks(
          enrollment.id,
          item.week,
          item.plan!.inverse,
        );
        undone.push(item.week);
      } catch {
        undoFailed.push(item.week);
      }
    }
    setResult({ ...result, undone });
    if (undoFailed.length)
      setError(
        t("No se pudo deshacer en las semanas: {weeks}.", {
          weeks: undoFailed.join(", "),
        }),
      );
    onCopied?.();
    guard.current = false;
    setBusy(false);
  };
  const close = (next: boolean) => {
    if (!guard.current) onOpenChange(next);
  };
  if (!hasPermission("Program.Edit")) return null;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="default" className="gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Copy aria-hidden className="size-5 text-primary" />
            {t("Copiar la semana {week}", { week: String(source.weekNumber) })}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Las celdas copiadas quedan personalizadas. Las semanas iniciadas se omiten.",
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-destructive-soft p-4 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {result ? (
            <section
              role="status"
              className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4"
            >
              <h3 className="font-semibold">{t("Resultado de la copia")}</h3>
              <p>
                {t("Semanas aplicadas: {count}", {
                  count: String(result.applied.length),
                })}
              </p>
              <p>
                {t("Semanas iniciadas omitidas: {count}", {
                  count: String(result.started.length),
                })}
              </p>
              {result.failed.length > 0 && (
                <p className="text-destructive">
                  {t("No se aplicó en las semanas: {weeks}.", {
                    weeks: result.failed.join(", "),
                  })}
                </p>
              )}
              {result.conflicts.length > 0 && (
                <p className="text-warning-soft-foreground">
                  {t("Cambiaron y no se sobrescribieron: {weeks}.", {
                    weeks: result.conflicts.join(", "),
                  })}
                </p>
              )}
              {result.undone.length > 0 && (
                <p>
                  {t("Semanas restauradas: {count}", {
                    count: String(result.undone.length),
                  })}
                </p>
              )}
              {canUndo && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void undo()}
                >
                  <Undo2 aria-hidden />
                  {t("Deshacer")}
                </Button>
              )}
            </section>
          ) : (
            <>
              <fieldset disabled={busy} className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold">
                  {t("Contenido a copiar")}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(["routines", "podcasts", "all"] as const).map((value) => (
                    <label
                      key={value}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm"
                    >
                      <input
                        type="radio"
                        name="copy-kind"
                        checked={kind === value}
                        onChange={() => setKind(value)}
                      />
                      {t(
                        value === "routines"
                          ? "Rutinas"
                          : value === "podcasts"
                            ? "Podcasts"
                            : "Rutinas y podcasts",
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={busy} className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold">
                  {t("Semanas de destino")}
                </legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Array.from(
                    { length: enrollment.totalWeeks },
                    (_, index) => index + 1,
                  )
                    .filter((week) => week !== source.weekNumber)
                    .map((week) => (
                      <label
                        key={week}
                        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={weeks.includes(week)}
                          onChange={() =>
                            setWeeks((prev) =>
                              prev.includes(week)
                                ? prev.filter((value) => value !== week)
                                : [...prev, week].sort((a, b) => a - b),
                            )
                          }
                        />
                        {t("Semana {week}", { week: String(week) })}
                      </label>
                    ))}
                </div>
              </fieldset>
              {!items ? (
                <Skeleton className="h-24" />
              ) : (
                <section
                  aria-label={t("Vista previa de la copia")}
                  className="rounded-xl border bg-muted/30 p-4 text-sm"
                >
                  <p>
                    {t("Semanas a actualizar: {count}", {
                      count: String(ready.length),
                    })}
                  </p>
                  <p>
                    {t("Semanas iniciadas omitidas: {count}", {
                      count: String(started),
                    })}
                  </p>
                  {items.some((item) => item.status === "failed") && (
                    <div role="alert">
                      <p>
                        {t(
                          "No se pudo preparar la copia. Vuelve a intentarlo.",
                        )}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setAttempt((value) => value + 1)}
                      >
                        {t("Reintentar")}
                      </Button>
                    </div>
                  )}
                  {empty > 0 && (
                    <p>
                      {t("Celdas sin contenido que se omiten: {count}", {
                        count: String(empty),
                      })}
                    </p>
                  )}
                  {disabledRest > 0 && (
                    <p>
                      {t(
                        "Celdas de descanso que se omiten: {count}",
                        { count: String(disabledRest) },
                      )}
                    </p>
                  )}
                  {unavailableUndo && (
                    <p>
                      {t(
                        "El destino contiene días vacíos; esta copia no permite deshacer.",
                      )}
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter className="m-0 px-6 py-4">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => close(false)}
          >
            {t(result ? "Cerrar" : "Cancelar")}
          </Button>
          {!result && (
            <Button
              disabled={
                busy ||
                !items ||
                ready.length === 0 ||
                items.some((item) => item.status === "failed")
              }
              onClick={() => void copy()}
            >
              {busy ? t("Guardando...") : t("Copiar a las semanas elegidas")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
