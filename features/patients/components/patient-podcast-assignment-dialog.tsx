"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Headphones, LockKeyhole } from "lucide-react";
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
import { useAppContext } from "@/providers/context-provider";
import { useAuth } from "@/providers/auth-provider";
import { useT, useI18n } from "@/providers/i18n-provider";
import { ApiError } from "@/lib/api/http";
import { MediaLibraryPicker } from "@/features/media/components/media-library-picker";
import { MediaPlayer } from "@/features/media/components/media-player";
import { isPlaceholderMedia } from "@/features/media/services/media-service";
import type { MediaItem } from "@/features/media/types";
import {
  assignPatientPodcasts,
  canAssignPatientPodcasts,
  MAX_BULK_PATIENTS,
  PODCAST_PROGRAM_WEEKS,
  type PodcastAssignmentPatient,
  type PatientPodcastAssignmentResult,
} from "../services/patient-podcast-assignment-service";

type Failure = "podcast" | "enrollment" | "range" | "permission" | "request";

export function PatientPodcastAssignmentDialog({
  patients,
  includesOtherPages = false,
  onClose,
  onApplied,
}: {
  patients: readonly PodcastAssignmentPatient[];
  includesOtherPages?: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const { user } = useAuth();
  const { can } = useAppContext();
  const permitted = canAssignPatientPodcasts(
    user?.roles ?? [],
    can("Program.Edit"),
  );
  const [step, setStep] = useState<"edit" | "review" | "result">("edit");
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<PatientPodcastAssignmentResult | null>(
    null,
  );
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);
  const ids = [...new Set(patients.map((patient) => patient.id))];
  const valid =
    permitted &&
    ids.length > 0 &&
    ids.length <= MAX_BULK_PATIENTS &&
    media?.mediaType === "Podcast" &&
    media.status === "Published" &&
    Boolean(media.storageKey.trim()) &&
    !isPlaceholderMedia(media) &&
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 1 &&
    from <= to &&
    to <= PODCAST_PROGRAM_WEEKS;
  const count = (value: number) =>
    value.toLocaleString(lang === "en" ? "en-US" : "es-CO");
  const weeks = Array.from(
    { length: PODCAST_PROGRAM_WEEKS },
    (_, index) => index + 1,
  );
  const errors: Record<Failure, string> = {
    podcast: "Elige un podcast publicado con un archivo válido.",
    enrollment:
      "Todos los pacientes de tu alcance deben tener un programa activo. Revisa la selección antes de continuar.",
    range:
      "El rango supera la duración del programa de un paciente. Ajusta las semanas.",
    permission: "No tienes permisos para realizar esta acción.",
    request:
      "No se pudo confirmar la asignación. Revisa el estado antes de reintentar.",
  };

  const apply = async () => {
    if (savingRef.current || step !== "review" || !valid || !media) return;
    savingRef.current = true;
    setSaving(true);
    setFailure(null);
    try {
      const response = await assignPatientPodcasts({
        patientIds: ids,
        mediaId: media.id,
        semanaDesde: from,
        semanaHasta: to,
      });
      // El resultado nunca expone identificadores que el solicitante no haya enviado.
      const sent = new Set(ids);
      setResult({
        ...response,
        omitidasSinAlcance: [...new Set(response.omitidasSinAlcance)].filter(
          (id) => sent.has(id),
        ),
      });
      setStep("result");
      onApplied();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "";
      if (detail.includes("PODCAST_NOT_PUBLISHED")) {
        setFailure("podcast");
        setMedia(null);
        setStep("edit");
      } else if (detail.includes("ACTIVE_ENROLLMENT_REQUIRED"))
        setFailure("enrollment");
      else if (detail.includes("PROGRAM_WEEK_OUT_OF_RANGE"))
        setFailure("range");
      else if (cause instanceof ApiError && cause.status === 403)
        setFailure("permission");
      else setFailure("request");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !savingRef.current) onClose();
        }}
      >
        <DialogContent
          size="lg"
          showCloseButton={!saving}
          className="gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="rounded-none border-0 border-b border-border bg-transparent px-6 py-5">
            <DialogTitle className="flex items-start gap-3">
              {step === "result" ? (
                <CheckCircle2
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-success"
                />
              ) : (
                <Headphones
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-primary"
                />
              )}
              {step === "edit"
                ? t("Asignar podcast en bloque")
                : step === "review"
                  ? t("Revisar asignación")
                  : t("Resultado de la asignación")}
            </DialogTitle>
            <DialogDescription>
              {step === "result"
                ? t("Revisa las asignaciones aplicadas y las omisiones.")
                : t(
                    "Un podcast, varias semanas y varios pacientes. Nada se guarda hasta confirmar.",
                  )}
            </DialogDescription>
          </DialogHeader>
          <DialogBody
            ref={bodyRef}
            aria-busy={saving}
            className="flex flex-col gap-5"
          >
            {!permitted ? (
              <p role="alert">
                {t("No tienes permisos para realizar esta acción.")}
              </p>
            ) : step === "result" && result ? (
              <div role="status" className="flex flex-col gap-5">
                <p className="break-words font-medium">
                  {media?.title} ·{" "}
                  {t("Semanas {from} a {to}", {
                    from: String(from),
                    to: String(to),
                  })}
                </p>
                <dl className="flex flex-col divide-y divide-border">
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt>{t("Personas con asignaciones aplicadas")}</dt>
                    <dd className="text-xl font-semibold tabular-nums text-success">
                      {count(result.aplicadas)}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt>{t("Personas con semanas iniciadas omitidas")}</dt>
                    <dd className="text-xl font-semibold tabular-nums text-warning">
                      {count(result.omitidasSemanaIniciada)}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt>{t("Personas omitidas por alcance")}</dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {count(result.omitidasSinAlcance.length)}
                    </dd>
                  </div>
                </dl>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Los conteos de aplicados y semanas iniciadas pueden incluir al mismo paciente.",
                  )}
                </p>
                {result.omitidasSinAlcance.length > 0 && (
                  <section
                    aria-label={t("Personas omitidas por alcance")}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-4"
                  >
                    <h3 className="flex items-center gap-2 font-semibold">
                      <LockKeyhole aria-hidden className="size-4" />
                      {t("Fuera de tu alcance")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "No se modificaron. Solo se muestran los identificadores enviados, sin nombres ni datos clínicos.",
                      )}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {result.omitidasSinAlcance.map((id) => (
                        <li key={id} className="break-all text-sm">
                          {id}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <p className="rounded-xl bg-muted/30 p-4 text-sm">
                  {t(
                    "Las asignaciones quedan personalizadas y las futuras publicaciones de plantilla las conservan.",
                  )}
                </p>
              </div>
            ) : (
              <>
                <div className="grid min-w-0 gap-5 md:grid-cols-2">
                  <section className="flex min-w-0 flex-col gap-3">
                    <h3 className="font-semibold">
                      {t("{count} paciente{s} seleccionado{s}", {
                        count: count(ids.length),
                        s: ids.length === 1 ? "" : "s",
                      })}
                    </h3>
                    <ul className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl bg-muted/30 p-3">
                      {patients.map((patient) => (
                        <li
                          key={patient.id}
                          className="max-w-full break-words rounded-lg bg-background px-3 py-2 text-sm"
                        >
                          {patient.name}
                        </li>
                      ))}
                    </ul>
                    {includesOtherPages && (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "La selección incluye pacientes de otras páginas o filtros.",
                        )}
                      </p>
                    )}
                  </section>
                  <section className="flex min-w-0 flex-col gap-3">
                    <h3 className="font-semibold">{t("Podcast")}</h3>
                    {media ? (
                      <>
                        <p className="break-words font-medium">{media.title}</p>
                        <MediaPlayer
                          key={media.id}
                          storageKey={media.storageKey}
                          mediaType="Podcast"
                          alt={media.title}
                        />
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("Elige un podcast publicado de la biblioteca.")}
                      </p>
                    )}
                    {step === "edit" && (
                      <Button
                        variant="outline"
                        onClick={() => setPickerOpen(true)}
                      >
                        {media ? t("Cambiar podcast") : t("Elegir podcast")}
                      </Button>
                    )}
                  </section>
                </div>
                {step === "edit" ? (
                  <section className="flex flex-col gap-3">
                    <h3 className="font-semibold">{t("Rango de semanas")}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-2 text-sm font-medium">
                        {t("Desde la semana")}
                        <select
                          aria-label={t("Desde la semana")}
                          value={from}
                          onChange={(event) => {
                            setFrom(Number(event.target.value));
                            setFailure(null);
                          }}
                          className="h-11 rounded-lg border border-input bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value={0} disabled>
                            {t("Elige una semana")}
                          </option>
                          {weeks.map((week) => (
                            <option key={week} value={week}>
                              {week}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium">
                        {t("Hasta la semana")}
                        <select
                          aria-label={t("Hasta la semana")}
                          value={to}
                          onChange={(event) => {
                            setTo(Number(event.target.value));
                            setFailure(null);
                          }}
                          className="h-11 rounded-lg border border-input bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value={0} disabled>
                            {t("Elige una semana")}
                          </option>
                          {weeks.map((week) => (
                            <option key={week} value={week}>
                              {week}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {from > 0 && to > 0 && from > to && (
                      <p role="alert" className="text-sm text-destructive">
                        {t(
                          "La semana final debe ser igual o posterior a la inicial.",
                        )}
                      </p>
                    )}
                    <div aria-hidden className="grid grid-cols-6 gap-2">
                      {weeks.map((week) => (
                        <span
                          key={week}
                          className={
                            week >= from && week <= to
                              ? "rounded-lg bg-primary-soft p-2 text-center font-medium text-primary-soft-foreground"
                              : "rounded-lg bg-muted/30 p-2 text-center text-muted-foreground"
                          }
                        >
                          {week}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("12 semanas, 83 días")}
                    </p>
                  </section>
                ) : (
                  <p className="rounded-xl bg-primary-soft p-4 font-medium text-primary-soft-foreground">
                    {t(
                      "Asignar {podcast} en las semanas {from} a {to} a {count} paciente{s}.",
                      {
                        podcast: media?.title ?? "",
                        from: String(from),
                        to: String(to),
                        count: count(ids.length),
                        s: ids.length === 1 ? "" : "s",
                      },
                    )}
                  </p>
                )}
                <p className="flex items-start gap-2 rounded-xl bg-warning-soft p-4 text-sm text-warning-soft-foreground">
                  <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t(
                    "Las semanas iniciadas se omiten y los pacientes fuera de tu alcance no se modifican. Los conteos se confirman al aplicar.",
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Todas las personas de tu alcance deben tener un programa activo.",
                  )}
                </p>
              </>
            )}
            {failure && (
              <p
                role="alert"
                className="rounded-xl bg-destructive-soft p-4 text-sm text-destructive-soft-foreground"
              >
                {t(errors[failure])}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="m-0 rounded-none px-6 py-4">
            {step === "result" ? (
              <Button onClick={onClose}>{t("Listo")}</Button>
            ) : (
              <>
                <Button variant="outline" disabled={saving} onClick={onClose}>
                  {t("Cancelar")}
                </Button>
                {step === "review" && (
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() => {
                      setStep("edit");
                      setFailure(null);
                    }}
                  >
                    {t("Atrás")}
                  </Button>
                )}
                <Button
                  disabled={!valid || saving}
                  onClick={() =>
                    step === "edit" ? setStep("review") : void apply()
                  }
                >
                  {saving
                    ? t("Aplicando...")
                    : step === "edit"
                      ? t("Revisar asignación")
                      : t("Confirmar y asignar")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MediaLibraryPicker
        destino="programa"
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={media ? [media.id] : []}
        title={t("Elegir podcast")}
        onConfirm={(items) => {
          const item = items[0];
          if (
            !item ||
            item.mediaType !== "Podcast" ||
            item.status !== "Published" ||
            !item.storageKey.trim() ||
            isPlaceholderMedia(item)
          ) {
            setMedia(null);
            setFailure("podcast");
            return;
          }
          setMedia(item);
          setFailure(null);
        }}
      />
    </>
  );
}
