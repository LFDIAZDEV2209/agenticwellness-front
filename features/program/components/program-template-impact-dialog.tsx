"use client";

import { useEffect, useRef, useState } from "react";
import { LockKeyhole, Pencil, Users, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import { useI18n, useT } from "@/providers/i18n-provider";
import type { ProgramTemplateListItem } from "../types";
import {
  previewProgramTemplateImpact,
  templateContentGaps,
  TASK_CODE_OPTIONS,
  WEEKDAY_LABELS,
  type TemplateImpact,
  type TemplateDayGap,
} from "../services/program-templates-service";

type PreviewState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; impact: TemplateImpact };

export function ProgramTemplateImpactDialog({
  template,
  onClose,
  onPublish,
  onEdit,
}: {
  template: ProgramTemplateListItem;
  onClose: () => void;
  onPublish: (id: string) => Promise<void>;
  onEdit: (gap?: TemplateDayGap) => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish =
    hasPermission("Program.Edit") && template.status === "Draft";
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [gaps, setGaps] = useState<TemplateDayGap[]>([]);
  const [failed, setFailed] = useState(false);
  const number = (value: number) =>
    value.toLocaleString(lang === "en" ? "en-US" : "es-CO");

  useEffect(() => {
    if (!canPublish) return;
    const controller = new AbortController();
    void previewProgramTemplateImpact(template.id, controller.signal).then(
      (impact) => {
        if (!controller.signal.aborted) {
          setPreview({ status: "ready", impact });
          setGaps(impact.huecos ?? []);
        }
      },
      () => {
        if (!controller.signal.aborted) setPreview({ status: "error" });
      },
    );
    return () => controller.abort();
  }, [template.id, canPublish, attempt]);

  const publish = async () => {
    if (
      savingRef.current ||
      !canPublish ||
      preview.status !== "ready" ||
      gaps.length
    )
      return;
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await onPublish(template.id);
      onClose();
    } catch (error) {
      setGaps(templateContentGaps(error));
      setFailed(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const gapGroups = [...new Set(gaps.map((gap) => gap.taskCode))].map(
    (code) => ({ code, gaps: gaps.filter((gap) => gap.taskCode === code) }),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !savingRef.current) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!saving}
        className="gap-0 overflow-hidden p-0 sm:max-w-[700px]"
      >
        <DialogHeader className="rounded-none border-0 border-b border-border bg-transparent px-6 py-5">
          <DialogTitle>
            {t("Publicar la versión {version}", {
              version: String(template.version + 1),
            })}
          </DialogTitle>
          <DialogDescription>{template.name}</DialogDescription>
        </DialogHeader>
        <DialogBody
          className="flex flex-col gap-6"
          aria-busy={preview.status === "loading" || saving}
        >
          {!canPublish ? (
            <p role="alert">
              {t("No tienes permisos para realizar esta acción.")}
            </p>
          ) : preview.status === "loading" ? (
            <div role="status" className="flex flex-col gap-4">
              <p className="sr-only">{t("Cargando impacto de publicación…")}</p>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : preview.status === "error" ? (
            <div role="alert" className="flex flex-col gap-3">
              <p>
                {t(
                  "No se pudo cargar el impacto. Reintenta antes de publicar.",
                )}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setPreview({ status: "loading" });
                  setAttempt((value) => value + 1);
                }}
              >
                {t("Reintentar")}
              </Button>
            </div>
          ) : (
            <>
              <section
                aria-label={t("A quién llega")}
                className="flex flex-col gap-4"
              >
                <h3 className="font-semibold">{t("A quién llega")}</h3>
                <dl className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-1 size-3 shrink-0 rounded bg-primary"
                    />
                    <dt className="flex-1">
                      {t("Recibirán los cambios desde su próxima semana")}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {number(preview.impact.pacientesQueCambian)}
                    </dd>
                  </div>
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-1 size-3 shrink-0 rounded bg-warning"
                    />
                    <dt className="flex-1">
                      {t("Conservan sus personalizaciones futuras")}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {number(preview.impact.conPersonalizacionesFuturas)}
                    </dd>
                  </div>
                </dl>
              </section>
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <p className="flex items-start gap-3">
                  <LockKeyhole
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-warning"
                  />
                  <span>
                    {t("{count} semanas ya iniciadas no se tocan.", {
                      count: number(preview.impact.semanasOmitidasIniciadas),
                    })}
                  </span>
                </p>
                <p className="flex items-start gap-3">
                  <Pencil
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <span>
                    {t(
                      "Solo cambian los elementos del programa. Lo personalizado se conserva.",
                    )}
                  </span>
                </p>
                <p className="flex items-start gap-3">
                  <Users
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <span>
                    {t(
                      "La acción respeta tu alcance. Los conteos pueden incluir a la misma persona.",
                    )}
                  </span>
                </p>
              </div>
              <section
                className="flex flex-col gap-3"
                aria-label={t("Comprobaciones de la plantilla")}
              >
                <h3 className="font-semibold">
                  {t("Comprobaciones de la plantilla")}
                </h3>
                {gaps.length ? (
                  <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive-soft/30 p-4"
                  >
                    <p className="font-medium">
                      {t("Completa estos días antes de publicar.")}
                    </p>
                    <div className="flex flex-col gap-4">
                      {gapGroups.map((group) => (
                        <section
                          key={group.code}
                          className="rounded-lg border border-destructive/20 bg-background/60 p-3"
                        >
                          <h4 className="font-semibold">
                            {t(
                              TASK_CODE_OPTIONS.find(
                                (option) => option.value === group.code,
                              )?.label ?? group.code,
                            )}{" "}
                            · {group.gaps.length}
                          </h4>
                          {[...new Set(group.gaps.map((gap) => gap.weekNumber))]
                            .sort((a, b) => a - b)
                            .map((week) => (
                              <details key={week} className="mt-2">
                                <summary className="min-h-11 cursor-pointer py-3 text-sm">
                                  {t("Semana {week}", { week: String(week) })} ·{" "}
                                  {
                                    group.gaps.filter(
                                      (gap) => gap.weekNumber === week,
                                    ).length
                                  }
                                </summary>
                                <ul className="flex flex-col gap-2">
                                  {group.gaps
                                    .filter((gap) => gap.weekNumber === week)
                                    .map((gap, index) => (
                                      <li
                                        key={`${gap.day}-${gap.taskCode}-${index}`}
                                      >
                                        <Button
                                          variant="link"
                                          className="h-auto min-h-11 whitespace-normal p-0 text-left text-destructive"
                                          onClick={() => onEdit(gap)}
                                        >
                                          <span className="font-medium">
                                            {t("Día {day} · Semana {week}", {
                                              day: String(gap.day),
                                              week: String(gap.weekNumber),
                                            })}
                                          </span>
                                          {" · "}
                                          {t(WEEKDAY_LABELS[gap.weekday - 1])}
                                          {" · "}
                                          {t(
                                            TASK_CODE_OPTIONS.find(
                                              (option) =>
                                                option.value === gap.taskCode,
                                            )?.label ?? gap.taskCode,
                                          )}
                                        </Button>
                                      </li>
                                    ))}
                                </ul>
                              </details>
                            ))}
                        </section>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-start gap-3 text-muted-foreground">
                    <ShieldCheck
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span>
                      {preview.impact.huecos
                        ? t("Los 83 días tienen el contenido requerido.")
                        : t(
                            "Al publicar se comprobará el contenido de los 83 días: podcast, rutina y plan nutricional.",
                          )}
                    </span>
                  </p>
                )}
              </section>
              {failed && !gaps.length && (
                <p role="alert" className="text-destructive">
                  {t(
                    "No se pudo publicar. Reintenta o vuelve a revisar la plantilla.",
                  )}
                </p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter className="m-0 rounded-none px-6 py-4">
          {gaps.length > 0 && (
            <Button variant="outline" onClick={() => onEdit()}>
              {t("Revisar plantilla")}
            </Button>
          )}
          <Button variant="outline" disabled={saving} onClick={onClose}>
            {t("Cancelar")}
          </Button>
          <Button
            disabled={
              !canPublish ||
              preview.status !== "ready" ||
              saving ||
              gaps.length > 0
            }
            onClick={() => void publish()}
          >
            {saving
              ? t("Publicando...")
              : t("Publicar versión {version}", {
                  version: String(template.version + 1),
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
