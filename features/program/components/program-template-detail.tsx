"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";
import type { ProgramTemplate, WeeklyDayTaskInput } from "../types";
import {
  TASK_CODE_OPTIONS,
  TEMPLATE_STATUS_LABELS,
  WEEKDAY_LABELS,
  type TemplateDayGap,
} from "../services/program-templates-service";
import { ProgramSequenceEditor } from "./program-sequence-editor";
import { TemplateNewVersionAction } from "./template-new-version-action";

interface ProgramTemplateDetailDialogProps {
  templateId: string | null;
  onClose: () => void;
  getTemplate: (id: string) => Promise<ProgramTemplate | null>;
  /** Compatibilidad con el contenedor: la secuencia usa el PUT por semana de 1.7b. */
  saveWeekdayTasks: (id: string, tasks: WeeklyDayTaskInput[]) => Promise<void>;
  initialGap?: TemplateDayGap;
}

export function ProgramTemplateDetailDialog({
  templateId,
  onClose,
  getTemplate,
  initialGap,
}: ProgramTemplateDetailDialogProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={Boolean(templateId)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        size="xl"
        showCloseButton={false}
        className="gap-5 bg-background p-4 sm:max-w-[min(96vw,96rem)] sm:p-6"
      >
        <DialogHeader className="flex-row items-center justify-between gap-4 border-0 bg-transparent p-0">
          <div>
            <DialogTitle>{t("Plantilla de programa")}</DialogTitle>
            <DialogDescription>{t("Secuencia de podcasts")}</DialogDescription>
          </div>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={onClose}
          >
            {t("Cerrar")}
          </Button>
        </DialogHeader>
        {templateId && (
          <TemplateContent
            key={templateId}
            templateId={templateId}
            getTemplate={getTemplate}
            onBusyChange={setBusy}
            initialGap={initialGap}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateContent({
  templateId,
  getTemplate,
  onBusyChange,
  initialGap,
}: {
  templateId: string;
  getTemplate: ProgramTemplateDetailDialogProps["getTemplate"];
  onBusyChange: (busy: boolean) => void;
  initialGap?: TemplateDayGap;
}) {
  const t = useT();
  const { hasPermission } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    template: ProgramTemplate | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void getTemplate(templateId)
      .then((template) => {
        if (active) setResult({ attempt, template });
      })
      .catch(() => {
        if (active) setResult({ attempt, template: null });
      });
    return () => {
      active = false;
    };
  }, [templateId, getTemplate, attempt]);
  if (result?.attempt !== attempt)
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  const template = result.template;
  if (!template)
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-destructive p-4"
      >
        <p>{t("No se pudo cargar la plantilla.")}</p>
        <Button
          variant="outline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t("Reintentar")}
        </Button>
      </div>
    );
  const otherTasks = template.days.filter((day) => day.taskCode !== "podcast");
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {template.name}
          </h2>
          <Badge variant="secondary">
            {t(TEMPLATE_STATUS_LABELS[template.status] ?? template.status)} · v
            {template.version}
          </Badge>
        </div>
        {template.description && (
          <p className="mt-2 text-sm text-muted-foreground">
            {template.description}
          </p>
        )}
      </header>
      {template.status === "Active" && (
        <section
          role="note"
          className="rounded-xl border border-primary/20 bg-primary-soft p-4 text-sm"
        >
          <p className="font-semibold">{t("Plantilla activa: solo lectura")}</p>
          <p className="mt-1">
            {t(
              "Crea un borrador con los 83 días de esta plantilla; la versión activa sigue vigente hasta publicar",
            )}
          </p>
          {hasPermission("Program.Edit") && (
            <div className="mt-3">
              <TemplateNewVersionAction />
            </div>
          )}
        </section>
      )}
      {template.totalWeeks === 12 ? (
        <ProgramSequenceEditor
          template={template}
          canEdit={hasPermission("Program.Edit")}
          onBusyChange={onBusyChange}
          initialDay={initialGap?.day}
          onSaved={(days) =>
            setResult((current) =>
              current && current.template
                ? { ...current, template: { ...current.template, days } }
                : current,
            )
          }
        />
      ) : (
        <p
          role="status"
          className="rounded-xl border border-border bg-card p-4 text-sm"
        >
          {t("La secuencia de 83 días requiere una plantilla de 12 semanas.")}
        </p>
      )}
      {otherTasks.length > 0 && (
        <details
          open={(initialGap && initialGap.taskCode !== "podcast") || undefined}
          className="min-w-0 rounded-xl border border-border bg-card p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold">
            {t("Tareas")}
          </summary>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Semana")}</TableHead>
                  <TableHead>{t("Día")}</TableHead>
                  <TableHead>{t("Tarea")}</TableHead>
                  <TableHead>{t("Puntos")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherTasks.map((day) => (
                  <TableRow key={day.id}>
                    <TableCell>{day.weekNumber ?? t("Todas")}</TableCell>
                    <TableCell>
                      {t(WEEKDAY_LABELS[day.weekday - 1] ?? "Día")}
                    </TableCell>
                    <TableCell>
                      {t(
                        TASK_CODE_OPTIONS.find(
                          (option) => option.value === day.taskCode,
                        )?.label ?? day.taskCode,
                      )}
                    </TableCell>
                    <TableCell>{day.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}
    </div>
  );
}
