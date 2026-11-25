"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, Moon, RotateCcw, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/providers/i18n-provider";
import { fetchExerciseRoutines } from "@/features/wellness/services/exercise-routines-service";
import { RoutineContraindications } from "@/features/wellness/components/routine-contraindications";
import type { ExerciseRoutineListItem } from "@/features/wellness/types";
import type { EnrollmentWeekResponse } from "../types";
import {
  agendaCell,
  type useWeekAgendaEditor,
} from "../hooks/use-week-agenda-editor";
import { PodcastPickerDialog } from "./podcast-picker-dialog";

type Editor = ReturnType<typeof useWeekAgendaEditor>;

export function WeekAgendaCellPanel({
  editor,
  data,
}: {
  editor: Editor;
  data: EnrollmentWeekResponse;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [catalog, setCatalog] = useState<{
    query: string;
    items: ExerciseRoutineListItem[];
    failed: boolean;
  } | null>(null);
  const [podcastOpen, setPodcastOpen] = useState(false);
  const selected = editor.selected!;
  const day = data.days.find((day) => day.weekday === selected.weekday);
  const task = day && agendaCell(day, selected.taskCode);
  const isRoutine = selected.taskCode === "ejercicio";
  useEffect(() => {
    if (!isRoutine || !editor.editable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchExerciseRoutines(
        1,
        10,
        { search, status: "Active", category: "all" },
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted)
            setCatalog({ query: search, items: result.data, failed: false });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setCatalog({ query: search, items: [], failed: true });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, attempt, isRoutine, editor.editable]);
  if (!day) return null;
  const rest = day.rest || task?.rest;
  const routineId = task?.routineId ?? task?.contentRefId;
  const editable =
    editor.editable && !(isRoutine && rest && !editor.restEnabled);
  const row = editor.rowFor(day, selected.taskCode);
  return (
    <Sheet open onOpenChange={(open) => !open && editor.select(null)}>
      <SheetContent
        showCloseButton={false}
        className="w-full! overflow-y-auto sm:max-w-lg!"
      >
        <SheetHeader className="border-b p-6">
          <SheetTitle>
            {t(isRoutine ? "Rutina" : "Podcast")} · {t(day.dayLabel)}
          </SheetTitle>
          <SheetDescription>
            {day.localDate} · {t("Los cambios se guardan al elegir.")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-w-0 flex-col gap-5 px-6">
          <section className="rounded-xl border bg-muted/30 p-4">
            <h3 className="text-xs font-medium text-muted-foreground">
              {t("Contenido actual")}
            </h3>
            <p className="mt-2 break-words font-semibold">
              {rest && isRoutine
                ? t("Descanso")
                : task?.contentName || t("Sin contenido")}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Así lo ve la persona")}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {data.days
                .find((d) => d.weekday === day.weekday)
                ?.tasks.filter((task) =>
                  ["podcast", "ejercicio"].includes(task.taskCode),
                )
                .map((task) => (
                  <li key={task.taskCode}>
                    {t(task.taskLabel)}:{" "}
                    {task.contentName || t("Sin contenido")}
                  </li>
                ))}
            </ul>
          </section>
          {!editor.context ? (
            <div role="status">
              {editor.contextError ? (
                <>
                  <p>{t("No se pudo cargar la edición de la semana.")}</p>
                  <Button variant="outline" onClick={editor.retryContext}>
                    {t("Reintentar")}
                  </Button>
                </>
              ) : (
                <Skeleton className="h-24" />
              )}
            </div>
          ) : !editor.editable ? (
            <p className="rounded-xl bg-warning-soft p-4 text-sm text-warning-soft-foreground">
              {t("Esta semana ya empezó; no se puede modificar.")}
            </p>
          ) : null}
          {editor.error && (
            <p
              role="alert"
              className="rounded-xl bg-destructive-soft p-4 text-sm text-destructive"
            >
              {t(editor.error)}
            </p>
          )}
          {editor.saved && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-success-soft p-3 text-sm"
            >
              <span>{t("Cambio guardado")}</span>
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
          {editor.context && editor.editable && (
            <>
              {isRoutine && (
                <>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      className="min-h-11 justify-start"
                      disabled={
                        !editable ||
                        editor.saving ||
                        !editor.restEnabled ||
                        !!rest
                      }
                      onClick={() =>
                        void editor.apply([{ ...row, rest: true }])
                      }
                    >
                      <Moon aria-hidden />
                      {t("Día de descanso")}
                    </Button>
                    {!editor.restEnabled && (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "Disponible cuando la app de los pacientes lo soporte.",
                        )}
                      </p>
                    )}
                  </div>
                  <section className="flex flex-col gap-3">
                    <Label htmlFor="agenda-routine-search">
                      {t("Cambiar rutina")}
                    </Label>
                    <div className="relative">
                      <Search
                        aria-hidden
                        className="absolute left-3 top-3 size-4 text-muted-foreground"
                      />
                      <Input
                        id="agenda-routine-search"
                        className="min-h-11 pl-9"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        disabled={!editable || editor.saving}
                      />
                    </div>
                    {!catalog || catalog.query !== search ? (
                      <Skeleton className="h-24" />
                    ) : catalog.failed ? (
                      <div role="alert">
                        <p>{t("No se pudieron cargar las rutinas.")}</p>
                        <Button
                          variant="outline"
                          onClick={() => setAttempt((n) => n + 1)}
                        >
                          {t("Reintentar")}
                        </Button>
                      </div>
                    ) : catalog.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("No se encontraron rutinas")}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {catalog.items.map((routine) => (
                          <li
                            key={routine.id}
                            className="rounded-xl border p-3"
                          >
                            <p className="mb-2 break-words font-medium">
                              {routine.name}
                            </p>
                            <RoutineContraindications
                              text={routine.contraindications}
                            />
                            <Button
                              variant="outline"
                              className="mt-2 min-h-11 w-full"
                              disabled={
                                !editable ||
                                editor.saving ||
                                (!rest && routineId === routine.id)
                              }
                              onClick={() =>
                                void editor.apply([
                                  { ...row, routineId: routine.id },
                                ])
                              }
                            >
                              {t("Elegir rutina")}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  {routineId && !rest && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-sm font-semibold">
                        {t("Mover a otro día")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t("Si el día tiene rutina, se intercambian ambas.")}
                      </p>
                      <div className="flex flex-col gap-2">
                        {data.days
                          .filter((target) => target.weekday !== day.weekday)
                          .map((target) => {
                            const other = agendaCell(target, "ejercicio");
                            const otherId =
                              other?.routineId ?? other?.contentRefId;
                            const targetRest = target.rest || other?.rest;
                            const sourceChange =
                              otherId && !targetRest
                                ? { ...row, routineId: otherId }
                                : { ...row, rest: true };
                            return (
                              <Button
                                key={target.weekday}
                                variant="outline"
                                className="min-h-11 justify-start"
                                disabled={
                                  editor.saving ||
                                  (!otherId && !editor.restEnabled) ||
                                  (!!targetRest && !editor.restEnabled)
                                }
                                onClick={() =>
                                  void editor.apply([
                                    sourceChange,
                                    {
                                      ...editor.rowFor(target, "ejercicio"),
                                      routineId,
                                    },
                                  ])
                                }
                              >
                                <ArrowRightLeft aria-hidden />
                                {t(
                                  otherId && !targetRest
                                    ? "Intercambiar con {day}"
                                    : "Mover a {day}",
                                  { day: t(target.dayLabel) },
                                )}
                              </Button>
                            );
                          })}
                      </div>
                      {!editor.restEnabled && (
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "Mover a un día vacío requiere habilitar descanso en el día de origen.",
                          )}
                        </p>
                      )}
                    </section>
                  )}
                </>
              )}
              {!isRoutine && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={editor.saving}
                  onClick={() => setPodcastOpen(true)}
                >
                  {t("Cambiar podcast")}
                </Button>
              )}
              <Button
                variant="outline"
                className="min-h-11"
                disabled={
                  !editable ||
                  editor.saving ||
                  !editor.defaults(day.weekday, selected.taskCode)
                }
                onClick={() => void editor.apply([{ ...row, reset: true }])}
              >
                <RotateCcw aria-hidden />
                {t("Restablecer al programa")}
              </Button>
              {!editor.inverse(day, selected.taskCode) && (
                <p className="text-xs text-muted-foreground">
                  {t("Este día estaba vacío; este cambio no permite deshacer.")}
                </p>
              )}
            </>
          )}
        </div>
        <SheetFooter className="px-6 pb-6">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={editor.saving}
            onClick={() => editor.select(null)}
          >
            {t("Cerrar")}
          </Button>
        </SheetFooter>
        {podcastOpen && (
          <PodcastPickerDialog
            open
            onOpenChange={setPodcastOpen}
            currentMediaId={task?.contentRefId ?? null}
            dayLabel={t(day.dayLabel)}
            onSelect={(id) => {
              setPodcastOpen(false);
              if (id) void editor.apply([{ ...row, mediaId: id }]);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
