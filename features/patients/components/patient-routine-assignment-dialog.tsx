"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Dumbbell, LockKeyhole } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import { useAppContext } from "@/providers/context-provider";
import { useI18n, useT } from "@/providers/i18n-provider";
import { ApiError } from "@/lib/api/http";
import { fetchExerciseRoutines, DIFFICULTY_OPTIONS } from "@/features/wellness/services/exercise-routines-service";
import type { ExerciseRoutineListItem, PaginatedResult } from "@/features/wellness/types";
import { MAX_BULK_PATIENTS, type PodcastAssignmentPatient } from "../services/patient-podcast-assignment-service";
import { assignPatientRoutines, canAssignPatientRoutines, ROUTINE_PROGRAM_WEEKS, type PatientRoutineAssignmentResult } from "../services/patient-routine-assignment-service";

const weeks = Array.from({ length: ROUTINE_PROGRAM_WEEKS }, (_, i) => i + 1);
type Failure = "routine" | "enrollment" | "range" | "permission" | "conflict" | "request";
const errors: Record<Failure, string> = {
  routine: "La rutina ya no está activa o disponible. Elige otra rutina antes de continuar.",
  enrollment: "Todos los pacientes de tu alcance deben tener un programa activo. Revisa la selección antes de continuar.",
  range: "El rango supera la duración del programa de un paciente. Ajusta las semanas.",
  permission: "No tienes permisos para realizar esta acción.",
  conflict: "El programa cambió durante la asignación. Revisa de nuevo antes de confirmar.",
  request: "No se pudo confirmar la asignación. Revisa el estado antes de reintentar.",
};

export function PatientRoutineAssignmentDialog({ patients, includesOtherPages, onClose, onApplied, returnFocus }: {
  patients: readonly PodcastAssignmentPatient[];
  includesOtherPages: boolean;
  onClose: () => void;
  onApplied: () => void;
  returnFocus: () => HTMLElement | null;
}) {
  const t = useT();
  const { lang } = useI18n();
  const { user } = useAuth();
  const { can, activeClinicId } = useAppContext();
  const permitted = canAssignPatientRoutines(user?.roles ?? [], can("Program.Edit"));
  const [step, setStep] = useState<"edit" | "review" | "result">("edit");
  const [routine, setRoutine] = useState<ExerciseRoutineListItem | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [catalog, setCatalog] = useState<{ key: string; data: PaginatedResult<ExerciseRoutineListItem> | null } | null>(null);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<PatientRoutineAssignmentResult | null>(null);
  const savingRef = useRef(false);
  const postRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ids = [...new Set(patients.map(patient => patient.id))];
  const loadKey = JSON.stringify([user?.id, activeClinicId, permitted, page, search, attempt]);
  const current = catalog?.key === loadKey ? catalog : null;
  const available = current?.data?.data.filter(item => item.status === "Active") ?? [];
  const valid = permitted && ids.length > 0 && ids.length <= MAX_BULK_PATIENTS && routine?.status === "Active"
    && from >= 1 && from <= to && to <= ROUTINE_PROGRAM_WEEKS;
  const count = (n: number) => n.toLocaleString(lang === "en" ? "en-US" : "es-CO");

  useEffect(() => {
    if (!permitted || step !== "edit") return;
    const controller = new AbortController();
    fetchExerciseRoutines(page, 8, { search, status: "Active", category: "all" }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setCatalog({ key: loadKey, data }); })
      .catch(() => { if (!controller.signal.aborted) setCatalog({ key: loadKey, data: null }); });
    return () => controller.abort();
  }, [page, search, attempt, permitted, loadKey, step]);
  useEffect(() => () => postRef.current?.abort(), []);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [step]);

  async function apply() {
    if (!valid || !routine || step !== "review" || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFailure(null);
    const controller = new AbortController(); postRef.current = controller;
    try {
      const response = await assignPatientRoutines({ patientIds: ids, routineId: routine.id, semanaDesde: from, semanaHasta: to }, controller.signal);
      if (controller.signal.aborted) return;
      setResult(response); setStep("result"); onApplied();
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "";
      if (message.includes("ROUTINE_NOT_ACTIVE") || (cause instanceof ApiError && cause.status === 404)) {
        setFailure("routine"); setRoutine(null); setAttempt(value => value + 1);
      } else if (message.includes("ACTIVE_ENROLLMENT_REQUIRED")) setFailure("enrollment");
      else if (message.includes("PROGRAM_WEEK_OUT_OF_RANGE")) setFailure("range");
      else if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) setFailure("permission");
      else if (cause instanceof ApiError && cause.status === 409) setFailure("conflict");
      else setFailure("request");
      // Cualquier resultado incierto exige volver a revisar; nunca se reenvía automáticamente.
      setStep("edit");
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !savingRef.current) onClose(); }}>
    <DialogContent size="default" className="gap-0 overflow-hidden p-0" showCloseButton={!saving} finalFocus={returnFocus}>
      <DialogHeader className="rounded-none border-0 border-b border-border bg-transparent px-6 py-5">
        <DialogTitle ref={headingRef} tabIndex={-1} className="flex items-center gap-3 outline-none">
          {step === "result" ? <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" /> : <Dumbbell aria-hidden className="size-5 shrink-0 text-primary" />}
          {step === "edit" ? t("Asignar rutina en bloque") : step === "review" ? t("Revisar asignación") : t("Resultado de la asignación")}
        </DialogTitle>
        <DialogDescription>{step === "result" ? t("Revisa las asignaciones aplicadas y las omisiones.") : t("Elige una rutina activa y las semanas. Nada se guarda hasta confirmar.")}</DialogDescription>
      </DialogHeader>
      <DialogBody ref={bodyRef} className="flex flex-col gap-5" aria-busy={saving}>
        {!permitted ? <Alert variant="destructive"><AlertDescription>{t(errors.permission)}</AlertDescription></Alert> : result && step === "result" ? <>
          <p role="status" className="break-words font-semibold">{routine?.name} · {t("Semanas {from} a {to}", { from: String(from), to: String(to) })}</p>
          <dl className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4"><dt>{t("Personas con asignaciones aplicadas")}</dt><dd className="font-semibold tabular-nums">{count(result.aplicadas)}</dd></div>
            <div className="flex items-start justify-between gap-4"><dt>{t("Personas con semanas iniciadas omitidas")}</dt><dd className="font-semibold tabular-nums">{count(result.omitidasSemanaIniciada)}</dd></div>
            <div className="flex items-start justify-between gap-4"><dt>{t("Personas omitidas por alcance")}</dt><dd className="font-semibold tabular-nums">{count(result.omitidasSinAlcance.length)}</dd></div>
          </dl>
          <p className="text-sm text-muted-foreground">{t("Los conteos de aplicados y semanas iniciadas pueden incluir al mismo paciente.")}</p>
          {result.omitidasSinAlcance.length > 0 && <section aria-label={t("Personas omitidas por alcance")} className="flex flex-col gap-2">
            <h3 className="font-semibold">{t("Fuera de tu alcance")}</h3>
            <p className="text-sm text-muted-foreground">{t("No se modificaron. Solo se muestran los identificadores enviados, sin nombres ni datos clínicos.")}</p>
            <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto">{result.omitidasSinAlcance.map(id => <li key={id} className="break-all text-sm">{id}</li>)}</ul>
          </section>}
          <p className="text-sm text-muted-foreground">{t("Las asignaciones quedan personalizadas y las futuras publicaciones de plantilla las conservan.")}</p>
        </> : <>
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t("{count} paciente{s} seleccionado{s}", { count: count(ids.length), s: ids.length === 1 ? "" : "s" })}</h3>
            <ul className="flex max-h-24 flex-wrap gap-x-4 gap-y-2 overflow-y-auto">{patients.map(patient => <li key={patient.id} className="break-words">{patient.name}</li>)}</ul>
            {includesOtherPages && <p className="text-xs text-muted-foreground">{t("La selección incluye pacientes de otras páginas o filtros.")}</p>}
          </section>
          {step === "edit" ? <>
            <fieldset className="flex min-w-0 flex-col gap-3" disabled={saving}>
              <legend className="mb-3 font-semibold">{t("Rutina activa")}</legend>
              <label className="flex flex-col gap-2 text-sm">{t("Buscar rutina")}<Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
              {routine && <p className="text-sm font-medium">{t("Rutina seleccionada: {routine}", { routine: routine.name })}</p>}
              {!current ? <div role="status" className="flex flex-col gap-3"><span className="sr-only">{t("Cargando rutinas…")}</span><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
                : !current.data ? <Alert variant="destructive"><AlertDescription>{t("No se pudieron cargar las rutinas. Reintenta para elegir una rutina activa.")}<Button variant="outline" className="mt-3" onClick={() => setAttempt(n => n + 1)}>{t("Reintentar")}</Button></AlertDescription></Alert>
                  : <>
                    <div className="flex flex-col gap-1">{available.map(item => <label key={item.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-3 hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
                      <input type="radio" name="bulk-routine" value={item.id} checked={routine?.id === item.id} onChange={() => { setRoutine(item); setFailure(null); }} className="mt-1 size-4 shrink-0 accent-primary" />
                      <span className="min-w-0"><span className="block break-words font-medium">{item.name}</span><span className="block text-sm text-muted-foreground">{t(item.category)} · {t(DIFFICULTY_OPTIONS.find(option => option.value === item.difficulty)?.label ?? item.difficulty)}{item.estimatedMinutes ? ` · ${t("{minutes} min", { minutes: String(item.estimatedMinutes) })}` : ""}</span></span>
                    </label>)}</div>
                    {available.length === 0 && <p role="status" className="py-3 text-muted-foreground">{t("No hay rutinas activas para esta búsqueda.")}</p>}
                    {current.data.totalPages > 1 && <nav aria-label={t("Páginas de rutinas")} className="flex flex-wrap items-center justify-between gap-2">
                      <Button variant="outline" disabled={page === 1} onClick={() => setPage(n => n - 1)}>{t("Anterior")}</Button>
                      <span className="text-sm tabular-nums">{t("Página {page} de {total}", { page: String(page), total: String(current.data.totalPages) })}</span>
                      <Button variant="outline" disabled={page >= current.data.totalPages} onClick={() => setPage(n => n + 1)}>{t("Siguiente")}</Button>
                    </nav>}
                  </>}
            </fieldset>
            <fieldset className="grid grid-cols-2 gap-3" disabled={saving}>
              <legend className="mb-3 font-semibold">{t("Rango de semanas")}</legend>
              {([{ label: "Desde la semana", value: from, set: setFrom }, { label: "Hasta la semana", value: to, set: setTo }]).map(field => <label key={field.label} className="flex flex-col gap-2 text-sm font-medium"><span className="min-h-10 sm:min-h-0">{t(field.label)}</span>
                <select aria-label={t(field.label)} value={field.value} onChange={event => { field.set(Number(event.target.value)); setFailure(null); }} aria-invalid={from > 0 && to > 0 && from > to} className="h-11 rounded-lg border border-input bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring">
                  <option value={0} disabled>{t("Elige una semana")}</option>{weeks.map(week => <option key={week} value={week}>{week}</option>)}
                </select>
              </label>)}
              {from > to && to > 0 && <p role="alert" className="col-span-2 text-sm text-destructive">{t("La semana final debe ser igual o posterior a la inicial.")}</p>}
            </fieldset>
          </> : <section className="flex flex-col gap-3" aria-label={t("Revisar asignación")}>
            <h3 className="break-words font-semibold">{routine?.name}</h3>
            <p>{t("Semanas {from} a {to}", { from: String(from), to: String(to) })}</p>
            <p>{t("Se sustituye el ejercicio y se retira el descanso en las semanas editables del rango. Podcasts y nutrición se conservan.")}</p>
            <p className="text-sm text-muted-foreground">{t("El resultado se calcula al confirmar. Las semanas iniciadas y el alcance se comprueban de nuevo en el servidor.")}</p>
          </section>}
          <Alert><LockKeyhole aria-hidden /><AlertDescription>{t("Las semanas iniciadas se omiten y los pacientes fuera de tu alcance no se modifican.")}</AlertDescription></Alert>
          {failure && <Alert variant="destructive"><AlertDescription>{t(errors[failure])}</AlertDescription></Alert>}
        </>}
      </DialogBody>
      <DialogFooter className="m-0 rounded-none px-6 py-4">
        {step === "result" ? <Button onClick={onClose}>{t("Listo")}</Button> : <>
          <Button variant="outline" disabled={saving} onClick={onClose}>{t("Cancelar")}</Button>
          {step === "review" && <Button variant="outline" disabled={saving} onClick={() => setStep("edit")}>{t("Volver a editar")}</Button>}
          <Button disabled={!valid || saving} onClick={() => { if (step === "edit") { setFailure(null); setStep("review"); } else void apply(); }}>
            {saving ? t("Asignando rutina…") : step === "edit" ? t("Revisar asignación") : t("Confirmar y asignar")}
          </Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
