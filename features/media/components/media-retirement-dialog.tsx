"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  TriangleAlert,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import { useAuth } from "@/providers/auth-provider";
import { useI18n, useT } from "@/providers/i18n-provider";
import type { MediaItem, MediaReferences } from "../types";
import { MediaLibraryPicker } from "./media-library-picker";
import { MediaPlayer } from "./media-player";
import { mediaStatusMeta } from "./media-meta";
import { getProgramTemplate } from "@/features/program/services/program-templates-service";

export type MediaRetirementAction = "unpublish" | "archive" | "delete";
interface Impact {
  pacientes: number;
  plantillas: number;
}
interface Preview {
  attempt: number;
  impact: Impact;
  references: MediaReferences | null;
}

function readImpact(value: unknown): Impact | null {
  if (!value || typeof value !== "object") return null;
  const impact = value as Record<string, unknown>;
  return typeof impact.pacientes === "number" &&
    Number.isInteger(impact.pacientes) &&
    impact.pacientes >= 0 &&
    typeof impact.plantillas === "number" &&
    Number.isInteger(impact.plantillas) &&
    impact.plantillas >= 0
    ? { pacientes: impact.pacientes, plantillas: impact.plantillas }
    : null;
}

/** El transporte de retiro queda aquí para no cambiar los adaptadores compartidos de carga múltiple. */
export function MediaRetirementDialog({
  media,
  action,
  onClose,
  onCompleted,
}: {
  media: MediaItem;
  action: MediaRetirementAction;
  onClose: () => void;
  onCompleted: (item: MediaItem | null) => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const { hasPermission } = useAuth();
  const [operation, setOperation] = useState(action);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [replacement, setReplacement] = useState<MediaItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<
    "conflict" | "replacement" | "request" | null
  >(null);
  const [conflictImpact, setConflictImpact] = useState<Impact | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [slow, setSlow] = useState(false);
  const [templateStates, setTemplateStates] = useState<Record<string, string>>(
    {},
  );
  const [completed, setCompleted] = useState<{
    item: MediaItem | null;
    impact: Impact | null;
  } | null>(null);
  const permission =
    operation === "delete"
      ? "Media.Delete"
      : operation === "archive"
        ? "Media.Archive"
        : "Media.Publish";
  const permitted = hasPermission(permission);
  const ready = preview?.attempt === attempt;
  const impact = conflictImpact ?? (ready ? preview.impact : null);
  const inUse = Boolean(
    (impact && (impact.pacientes > 0 || impact.plantillas > 0)) ||
    preview?.references?.enrollmentReferences.some((row) => !row.isFrozen) ||
    preview?.references?.routineReferences?.length ||
    error === "conflict",
  );
  const needsReplacement = inUse || Boolean(conflictImpact);
  const canChoose =
    media.mediaType === "Podcast" ||
    media.mediaType === "Video" ||
    media.mediaType === "Image";
  const labels = {
    unpublish: t("Despublicar"),
    archive: t("Archivar"),
    delete: t("Eliminar"),
  };
  const confirmLabels = {
    unpublish: t("Despublicar y reemplazar"),
    archive: t("Archivar y reemplazar"),
    delete: t("Eliminar y reemplazar"),
  };
  const number = (value: number) =>
    value.toLocaleString(lang === "en" ? "en-US" : "es-CO");

  useEffect(() => {
    if (!permitted) return;
    const controller = new AbortController();
    void Promise.all([
      apiFetch<unknown>(
        `${env.apiUrl}/api/v1/media/${media.id}/retirement-impact`,
        { signal: controller.signal },
      ),
      apiFetch<MediaReferences>(
        `${env.apiUrl}/api/v1/media/${media.id}/references`,
        {
          signal: controller.signal,
        },
      ).catch(() => null),
    ])
      .then(([data, references]) => {
        if (controller.signal.aborted) return;
        const parsed = readImpact(data);
        if (!parsed) {
          setPreviewFailed(true);
          return;
        }
        setPreview({ attempt, impact: parsed, references });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreviewFailed(true);
      });
    return () => controller.abort();
  }, [media.id, permitted, attempt]);

  useEffect(() => {
    if ((!saving && ready) || previewFailed || !permitted) return;
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [ready, saving, previewFailed, permitted, attempt]);
  useEffect(() => {
    if (!preview?.references || !hasPermission("Program.View")) return;
    let active = true;
    const ids = [
      ...new Set(
        preview.references.templateReferences.map((row) => row.templateId),
      ),
    ];
    void Promise.all(
      ids.map(async (id) => {
        try {
          return [id, (await getProgramTemplate(id)).status] as const;
        } catch {
          return [id, "unknown"] as const;
        }
      }),
    ).then((rows) => {
      if (active) setTemplateStates(Object.fromEntries(rows));
    });
    return () => {
      active = false;
    };
  }, [preview, hasPermission]);

  const execute = async () => {
    if (
      savingRef.current ||
      !permitted ||
      !ready ||
      deleteBlocked ||
      (needsReplacement && !replacement)
    )
      return;
    if (
      replacement &&
      (replacement.id === media.id ||
        replacement.status !== "Published" ||
        replacement.mediaType !== media.mediaType)
    ) {
      setError("replacement");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSlow(false);
    setError(null);
    try {
      const base = `${env.apiUrl}/api/v1/media/${media.id}`;
      const updated =
        operation === "delete"
          ? await apiFetch<void>(
              `${base}${replacement ? `?replacementMediaId=${encodeURIComponent(replacement.id)}` : ""}`,
              { method: "DELETE" },
            ).then(() => null)
          : await apiFetch<MediaItem & { retirementImpact?: Impact }>(
              `${base}/${operation}`,
              {
                method: "POST",
                body: JSON.stringify({
                  replacementMediaId: replacement?.id ?? null,
                }),
              },
            );
      const finalImpact =
        updated && "retirementImpact" in updated
          ? readImpact(updated.retirementImpact)
          : null;
      setCompleted({ item: updated, impact: finalImpact });
      onCompleted(updated);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setConflictImpact(readImpact(cause.extensions?.impact) ?? impact);
        setDeleteBlocked(operation === "delete" && Boolean(replacement));
        setError("conflict");
      } else if (cause instanceof ApiError && cause.status === 422) {
        setReplacement(null);
        setError("replacement");
      } else setError("request");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const changeOperation = (next: MediaRetirementAction) => {
    setOperation(next);
    setDeleteBlocked(false);
    setError(null);
  };
  const templateReferences = [
    ...new Map(
      (preview?.references?.templateReferences ?? []).map((row) => [
        row.templateId,
        row,
      ]),
    ).values(),
  ];
  const drafts = templateReferences.filter(
    (row) => templateStates[row.templateId] === "Draft",
  );
  const routines = preview?.references?.routineReferences ?? [];
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !savingRef.current) onClose();
        }}
      >
        <DialogContent
          showCloseButton={!saving}
          size="lg"
          className="gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="rounded-none border-0 border-b border-border bg-transparent px-6 py-5">
            <DialogTitle className="flex items-start gap-3">
              {completed ? (
                <CheckCircle2
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-success"
                />
              ) : (
                <TriangleAlert
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-warning"
                />
              )}
              <span className="break-words">
                {completed
                  ? t("Cambios guardados")
                  : `${labels[operation]} «${media.title}»`}
              </span>
            </DialogTitle>
            <DialogDescription>
              {completed
                ? t("La biblioteca se ha actualizado.")
                : t(
                    "Revisa el impacto y elige un sustituto si el medio está en uso.",
                  )}
            </DialogDescription>
          </DialogHeader>
          <DialogBody
            aria-busy={saving || (!ready && !previewFailed)}
            className="p-0"
          >
            {!permitted ? (
              <p role="alert" className="p-6">
                {t("No tienes permisos para realizar esta acción.")}
              </p>
            ) : completed ? (
              <div role="status" className="flex flex-col gap-5 p-6">
                <div className="flex flex-wrap items-center gap-4 rounded-xl bg-muted/40 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{media.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {completed.item
                        ? t(mediaStatusMeta[completed.item.status].label)
                        : t("Eliminado")}
                    </p>
                  </div>
                  {replacement && (
                    <>
                      <ArrowRight aria-hidden className="size-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold">
                          {replacement.title}
                        </p>
                        <p className="text-sm text-success">{t("Publicado")}</p>
                      </div>
                    </>
                  )}
                </div>
                {completed.impact && (
                  <p>
                    {t(
                      "Impacto confirmado: {patients} personas y {templates} plantillas.",
                      {
                        patients: number(completed.impact.pacientes),
                        templates: number(completed.impact.plantillas),
                      },
                    )}
                  </p>
                )}
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t(
                    "Las semanas iniciadas y los elementos personalizados se conservan.",
                  )}
                </p>
                <p className="text-sm text-warning-soft-foreground">
                  {t(
                    "Los borradores no se modifican. Revisa sus referencias antes de publicarlos.",
                  )}
                  {drafts.length > 0 &&
                    ` ${drafts.map((row) => row.templateName).join(", ")}`}
                </p>
              </div>
            ) : previewFailed ? (
              <div role="alert" className="flex flex-col items-start gap-3 p-6">
                <p>
                  {t(
                    "No se pudo cargar el impacto. Reintenta antes de continuar.",
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreviewFailed(false);
                    setSlow(false);
                    setAttempt((value) => value + 1);
                  }}
                >
                  {t("Reintentar")}
                </Button>
              </div>
            ) : !ready ? (
              <div role="status" className="flex flex-col gap-4 p-6">
                <p className="text-sm text-muted-foreground">
                  {t("Consultando el impacto y las referencias…")}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <section className="space-y-3 rounded-xl border p-4">
                    <h3 className="font-semibold">{t("Dónde se usa")}</h3>
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </section>
                  <section className="space-y-3 rounded-xl border p-4">
                    <h3 className="font-semibold">{t("Medio sustituto")}</h3>
                    <Skeleton className="h-36 w-full" />
                  </section>
                </div>
                {slow && (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "La consulta está tardando más de lo habitual. Puedes esperar o cancelar.",
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid min-w-0 md:grid-cols-2">
                <section
                  aria-label={t("Dónde se usa")}
                  className="flex min-w-0 flex-col gap-5 border-b border-border bg-muted/30 p-6 md:border-r md:border-b-0"
                >
                  <h3 className="font-semibold">{t("Dónde se usa")}</h3>
                  <dl className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <dt className="order-last text-sm text-muted-foreground">
                        {t("Personas")}
                      </dt>
                      <dd className="text-2xl font-semibold tabular-nums">
                        {number(impact?.pacientes ?? 0)}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="order-last text-sm text-muted-foreground">
                        {t("Plantillas activas que se actualizarán")}
                      </dt>
                      <dd className="text-2xl font-semibold tabular-nums">
                        {number(impact?.plantillas ?? 0)}
                      </dd>
                    </div>
                  </dl>
                  {templateReferences.length > 0 && (
                    <section className="space-y-2">
                      <h4 className="text-sm font-medium">
                        {t("Referencias en plantillas")}
                      </h4>
                      <ul className="flex flex-col gap-2 text-sm">
                        {templateReferences.map((row) => (
                          <li key={row.templateId} className="break-words">
                            {row.templateName} ·{" "}
                            {t(
                              templateStates[row.templateId] === "Active"
                                ? "Activa · se actualizará"
                                : templateStates[row.templateId] === "Draft"
                                  ? "Borrador · no se modifica"
                                  : templateStates[row.templateId] ===
                                      "Archived"
                                    ? "Archivada · no se modifica"
                                    : "Estado no disponible",
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning-soft-foreground">
                    {t(
                      "Los borradores no se modifican. Revisa sus referencias antes de publicarlos.",
                    )}
                    {drafts.length > 0 &&
                      ` ${drafts.map((row) => row.templateName).join(", ")}`}
                  </p>
                  {routines.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <h4 className="text-sm font-medium">{t("Rutinas")}</h4>
                      <ul className="flex flex-col gap-1 text-sm">
                        {[
                          ...new Set(routines.map((row) => row.routineName)),
                        ].map((name) => (
                          <li key={name} className="break-words">
                            {name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <LockKeyhole
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0"
                    />
                    {t(
                      "Las semanas iniciadas y los elementos personalizados se conservan.",
                    )}
                  </p>
                  {operation === "delete" && (
                    <p className="text-sm">
                      {t(
                        "Eliminar puede seguir bloqueado si hay referencias históricas o individuales. Puedes despublicar o archivar con un sustituto.",
                      )}
                    </p>
                  )}
                </section>
                <section
                  aria-label={t("Medio sustituto")}
                  className="flex min-w-0 flex-col gap-4 p-6"
                >
                  <h3 className="font-semibold">{t("Medio sustituto")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {needsReplacement
                      ? t(
                          "Elige otro medio publicado del mismo tipo para continuar.",
                        )
                      : t(
                          "Sin uso detectado. Puedes confirmar sin sustituto; el servidor volverá a comprobar las referencias.",
                        )}
                  </p>
                  {replacement && (
                    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-4">
                      <p className="break-words font-medium">
                        {replacement.title}
                      </p>
                      <MediaPlayer
                        key={replacement.id}
                        storageKey={replacement.storageKey}
                        mediaType={replacement.mediaType}
                        alt={replacement.title}
                      />
                      <Button
                        variant="ghost"
                        disabled={saving}
                        onClick={() => setReplacement(null)}
                      >
                        {t("Quitar")}
                      </Button>
                    </div>
                  )}
                  {canChoose && (
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() => setPickerOpen(true)}
                    >
                      {replacement
                        ? t("Cambiar sustituto")
                        : t("Elegir sustituto")}
                    </Button>
                  )}
                  {!canChoose && needsReplacement && (
                    <p role="alert">
                      {t(
                        "Este tipo de medio no tiene sustitutos en los destinos disponibles.",
                      )}
                    </p>
                  )}
                  {error && (
                    <p
                      role="alert"
                      className="rounded-xl bg-destructive-soft p-4 text-sm text-destructive-soft-foreground"
                    >
                      {error === "conflict"
                        ? deleteBlocked
                          ? t(
                              "El servidor mantiene bloqueada la eliminación. No se aplicaron cambios. Despublica o archiva con el sustituto para conservar el historial.",
                            )
                          : t(
                              "El medio tiene referencias activas. Elige un sustituto para continuar.",
                            )
                        : error === "replacement"
                          ? t(
                              "El sustituto ya no es válido. Elige otro medio publicado del mismo tipo.",
                            )
                          : t(
                              "No se pudo completar la acción. Revisa el estado del medio antes de reintentar.",
                            )}
                    </p>
                  )}
                  {operation === "delete" && error === "conflict" && (
                    <div className="flex flex-wrap gap-2">
                      {hasPermission("Media.Archive") && (
                        <Button
                          variant="outline"
                          onClick={() => changeOperation("archive")}
                        >
                          {t("Archivar en su lugar")}
                        </Button>
                      )}
                      {hasPermission("Media.Publish") &&
                        media.status === "Published" && (
                          <Button
                            variant="outline"
                            onClick={() => changeOperation("unpublish")}
                          >
                            {t("Despublicar")}
                          </Button>
                        )}
                    </div>
                  )}
                </section>
              </div>
            )}
          </DialogBody>
          <DialogFooter className="m-0 rounded-none px-6 py-4">
            {completed ? (
              <Button onClick={onClose}>{t("Listo")}</Button>
            ) : (
              <>
                <Button variant="outline" disabled={saving} onClick={onClose}>
                  {t("Cancelar")}
                </Button>
                <Button
                  variant={operation === "delete" ? "destructive" : "default"}
                  disabled={
                    !permitted ||
                    !ready ||
                    previewFailed ||
                    saving ||
                    deleteBlocked ||
                    (needsReplacement && !replacement)
                  }
                  onClick={() => void execute()}
                >
                  {saving
                    ? t("Procesando...")
                    : replacement
                      ? confirmLabels[operation]
                      : labels[operation]}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MediaLibraryPicker
        destino={media.mediaType === "Podcast" ? "programa" : "rutinas"}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        replacementFor={media}
        selectedIds={replacement ? [replacement.id] : []}
        title={t("Elegir sustituto")}
        onConfirm={(items) => {
          setReplacement(items[0] ?? null);
          setError(null);
        }}
      />
    </>
  );
}
