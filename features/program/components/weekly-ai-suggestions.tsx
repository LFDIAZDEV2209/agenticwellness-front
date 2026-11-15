"use client";

import { Component, useId, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useI18n, useT } from "@/providers/i18n-provider";
import { useWeeklyAiSuggestions } from "../hooks/use-weekly-ai-suggestions";
import { formatSummaryDate } from "../services/patient-ai-summary-service";
import { patientSummarySectionLabels } from "./patient-ai-summary";
import type { EnrollmentWeekResponse } from "../types";
import type { WeeklyAiSuggestion } from "../types/weekly-ai-suggestions";

interface Props {
  enrollmentId: string;
  week: EnrollmentWeekResponse;
  editable: boolean;
  restEnabled: boolean;
  disabled: boolean;
  onWeekChanged: (week: EnrollmentWeekResponse) => void;
  onBusyChange: (busy: boolean) => void;
  onReloadWeek: () => void;
}
class SuggestionsBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function WeeklyAiSuggestions(props: Props) {
  const t = useT();
  const { lang } = useI18n();
  return <SuggestionsBoundary key={`${props.enrollmentId}:${props.week.weekNumber}:${lang}`} fallback={<p role="status" className="text-sm text-muted-foreground">{t("No pudimos mostrar las sugerencias de IA. El editor manual sigue disponible.")}</p>}>
    <WeeklyAiSuggestionsContent {...props} />
  </SuggestionsBoundary>;
}
function WeeklyAiSuggestionsContent(props: Props) {
  const { enrollmentId, week, editable, restEnabled, disabled, onWeekChanged, onBusyChange } = props;
  const t = useT();
  const { lang } = useI18n();
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const state = useWeeklyAiSuggestions(enrollmentId, week, lang, onBusyChange);
  const [selection, setSelection] = useState<{ draftId: string; index: number; week: string } | null>(null);
  const [applied, setApplied] = useState(false);
  const draft = state.draft;
  const selected = draft && selection?.draftId === draft.id && selection.week === JSON.stringify(week)
    ? draft.suggestions.find(s => s.index === selection.index) : null;
  const locked = disabled || state.running || !editable || !!draft?.stale || !!state.issue;
  const currentLabel = (s: WeeklyAiSuggestion) => {
    const day = week.days.find(d => d.localDate === s.date);
    const task = day?.tasks.find(task => task.taskCode === (s.slotKind === "routine" ? "ejercicio" : "podcast"));
    return s.slotKind === "routine" && (day?.rest || task?.rest) ? t("Descanso") : task?.contentName || t("Sin contenido");
  };
  const targetLabel = (s: WeeklyAiSuggestion) => s.kind === "rest" ? t("Descanso") : s.label;
  const reference = (position: number, key: string | number) => {
    const source = draft?.sources[position];
    if (!source) return null;
    return <a key={key} href={`#${id}-source-${position}`} className="inline-block min-h-6 min-w-6 rounded-sm px-1 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={t("Ver fuente {reference}: {section}, del {from} al {to}", { reference: `[${position + 1}]`, section: t(patientSummarySectionLabels[source.section]), from: formatSummaryDate(source.from, lang), to: formatSummaryDate(source.to, lang) })}>[{position + 1}]</a>;
  };
  const renderReason = (reason: string) => reason.split(/(\[[a-zA-Z][a-zA-Z0-9_.:-]{0,79}\])/g).map((part, index) => {
    const position = draft?.sources.findIndex(source => `[${source.ref}]` === part) ?? -1;
    return position < 0 ? <span key={index}>{part}</span> : reference(position, index);
  });
  async function confirm() {
    if (!selected || locked || selected.state !== "draft" || selected.kind === "rest" && !restEnabled) return;
    const result = await state.apply(selected.index);
    if (result) { setSelection(null); setApplied(true); onWeekChanged(result.week); }
  }
  if (!state.enabled || state.blocked) return null;
  if (state.loading) return <div role="status" aria-label={t("Cargando sugerencias de IA")} data-testid="weekly-ai-suggestions-loading" className="flex flex-col gap-3 rounded-xl border p-5"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-full" /></div>;
  if (!draft && !state.canManage) return null;
  const feedback = state.issue === "conflict" || draft?.stale ? t("El plan cambió o la semana ya no es editable. Recarga y revisa antes de generar nuevas sugerencias.")
    : state.issue === "uncertain" ? t("No pudimos confirmar el resultado. Vuelve a consultar antes de reintentar la aplicación.")
    : state.issue === "notAllowed" ? t("No se puede aplicar esta alternativa. Revisa la semana y las opciones disponibles.")
    : state.issue === "insufficient" ? t("No hay datos o alternativas suficientes para sugerir cambios en esta semana.")
    : state.issue ? draft ? t("No se pudieron generar las sugerencias. Se conserva el borrador anterior con su fecha original.") : t("No se pudieron generar las sugerencias. Puedes intentarlo de nuevo.")
    : state.readIssue ? t("No pudimos consultar las sugerencias de IA. El editor manual sigue disponible.") : null;
  const actions = state.canManage && <div className="flex flex-wrap items-center gap-3" data-testid="weekly-ai-actions">
    <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal py-2" disabled={disabled || state.running || !editable || !!state.readIssue}
      onClick={() => { setApplied(false); void state.generate(); }}>
      <Sparkles aria-hidden="true" data-icon="inline-start" />{t(state.running ? "Procesando sugerencias de IA…" : draft ? "Regenerar sugerencias de IA" : "Generar sugerencias de IA")}
    </Button>
    {(state.readIssue || state.issue || draft?.stale) && <Button type="button" variant="outline" className="min-h-11" disabled={state.running || disabled} onClick={props.onReloadWeek}>{t("Volver a consultar sugerencias")}</Button>}
    {!editable && <p className="text-sm text-muted-foreground">{t("Solo se generan y aplican sugerencias en semanas futuras editables.")}</p>}
  </div>;
  const notices = <>{feedback && <p role="status" data-testid="weekly-ai-feedback" className="text-sm text-muted-foreground">{feedback}</p>}
    {applied && <p role="status" data-testid="weekly-ai-applied" className="text-sm">{t("Sugerencia aplicada. La celda queda personalizada y el cambio se registra en la bitácora.")}</p>}</>;
  if (!draft) return <div className="flex flex-col gap-3">{actions}{notices}</div>;
  const generated = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(draft.generatedAt));
  return <section aria-labelledby={`${id}-title`} data-testid="weekly-ai-suggestions" aria-busy={state.running}>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3"><CardTitle><h2 id={`${id}-title`}>{t("Sugerencias para este plan")}</h2></CardTitle><Badge variant="secondary">{t("Estimado por IA")}</Badge></div>
        <CardDescription>{t("Revisa y confirma cada cambio. Generar sugerencias no modifica el plan.")}</CardDescription>
        <p className="text-sm text-muted-foreground">{t("Del {from} al {to}", { from: formatSummaryDate(draft.startDate, lang), to: formatSummaryDate(draft.endDate, lang) })}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {actions}{notices}
        {draft.suggestions.length === 0 ? <p role="status">{t("No hay sugerencias para esta semana.")}</p> : <ol className="flex flex-col divide-y divide-border">
          {draft.suggestions.map(s => <li key={s.index} className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0" data-testid={`weekly-ai-suggestion-${s.index}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-sm text-muted-foreground"><time dateTime={s.date}>{formatSummaryDate(s.date, lang)}</time> · {t(s.slotKind === "routine" ? "Rutina" : "Podcast")}</p><h3 className="break-words font-semibold">{targetLabel(s)}</h3></div>
              {s.state === "applied" ? <Badge variant="outline">{t("Aplicada")}</Badge> : state.canManage && <Button type="button" variant="outline" className="min-h-11" disabled={locked || s.kind === "rest" && !restEnabled} onClick={() => setSelection({ draftId: draft.id, index: s.index, week: JSON.stringify(week) })}>{t("Revisar cambio")}</Button>}
            </div>
            <p className="max-w-prose whitespace-pre-line break-words leading-relaxed" lang={draft.language}>{renderReason(s.reason)}</p>
            <p className="break-words text-sm text-muted-foreground">{t("Ahora: {content}", { content: currentLabel(s) })}</p>
            <p className="text-sm" data-testid="weekly-ai-references"><span className="text-muted-foreground">{t("Fuentes de la sugerencia")}: </span>{s.sourceRefs.map((r, index) => reference(draft.sources.findIndex(source => source.ref === r), `${r}:${index}`))}</p>
            {s.state === "applied" && s.appliedAt && <time className="text-xs text-muted-foreground" dateTime={s.appliedAt}>{t("Aplicada el {date} (UTC)", { date: new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(s.appliedAt)) })}</time>}
            {s.kind === "rest" && !restEnabled && s.state !== "applied" && <p className="text-sm text-muted-foreground">{t("El descanso aún no está habilitado.")}</p>}
          </li>)}
        </ol>}
      </CardContent>
      <CardFooter className="flex-col items-start gap-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><time dateTime={draft.generatedAt} data-testid="weekly-ai-generated-at">{t("Generado el {date} (UTC)", { date: generated })}</time>{draft.model && <span className="break-all">{t("Modelo: {model}", { model: draft.model })}</span>}</div>
        <div className="flex flex-col gap-2"><h3 className="text-sm font-semibold">{t("Datos usados por las sugerencias")}</h3>
          <ul className="flex flex-col gap-2 text-sm">{draft.sources.map((source, index) => <li key={source.ref} id={`${id}-source-${index}`} tabIndex={-1} className="break-words focus-visible:outline-2 focus-visible:outline-ring">[{index + 1}] {t(patientSummarySectionLabels[source.section])} · {formatSummaryDate(source.from, lang)} – {formatSummaryDate(source.to, lang)}</li>)}</ul>
        </div>
      </CardFooter>
    </Card>
    <AlertDialog open={!!selected} onOpenChange={(open, details) => { if (state.running) details.cancel(); else if (!open) setSelection(null); }}>
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogHeader><AlertDialogTitle>{t("Aplicar sugerencia al plan")}</AlertDialogTitle><AlertDialogDescription>{t("Confirma este cambio individual. Se guardará con tu usuario en la bitácora.")}</AlertDialogDescription></AlertDialogHeader>
        {selected && <div className="flex flex-col gap-4" data-testid="weekly-ai-confirmation">
          <Badge variant="secondary" className="self-start">{t("Estimado por IA")}</Badge>
          <p className="text-sm">{formatSummaryDate(selected.date, lang)} · {t(selected.slotKind === "routine" ? "Rutina" : "Podcast")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2 rounded-xl border p-4"><h3 className="text-sm text-muted-foreground">{t("Ahora")}</h3><p className="break-words font-semibold">{currentLabel(selected)}</p></div>
            <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/30 p-4"><h3 className="text-sm text-muted-foreground">{t("Después")}</h3><p className="break-words font-semibold">{targetLabel(selected)}</p></div>
          </div>
          <p className="whitespace-pre-line break-words text-sm leading-relaxed">{selected.reason}</p>
          {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
        </div>}
        <AlertDialogFooter><AlertDialogCancel ref={cancel} disabled={state.running}>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="secondary" disabled={locked} onClick={() => void confirm()}>{t(state.running ? "Aplicando sugerencia…" : "Confirmar y aplicar")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
