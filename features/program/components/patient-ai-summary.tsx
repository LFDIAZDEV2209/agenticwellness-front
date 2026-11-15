"use client";

import { Component, type ReactNode, useId } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n, useT } from "@/providers/i18n-provider";
import { useAppContext } from "@/providers/context-provider";
import { usePatientAiSummary } from "../hooks/use-patient-ai-summary";
import { formatSummaryDate } from "../services/patient-ai-summary-service";
import type { PatientAiSummary, PatientSummarySection, PatientSummarySource } from "../types/patient-ai-summary";

export const patientSummarySectionLabels: Record<PatientSummarySection, string> = {
  program: "Programa", nutrition: "Nutrición", exercise: "Ejercicio", podcasts: "Podcasts",
  tests: "Evaluaciones", measurements: "Mediciones", alerts: "Seguimiento",
};
interface Props { patientId: string; onOpenSource?: (source: PatientSummarySource) => void }

/** Un fallo de este bloque opcional nunca reemplaza el resto del Perfil 360. */
class SummaryBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function PatientAiSummaryPanel(props: Props) {
  const t = useT();
  const { lang } = useI18n();
  return <SummaryBoundary key={`${props.patientId}:${lang}`} fallback={<p className="text-sm text-muted-foreground" role="status">{t("No pudimos mostrar el resumen de IA. El resto del perfil sigue disponible.")}</p>}>
    <PatientAiSummaryContent {...props} />
  </SummaryBoundary>;
}

function PatientAiSummaryContent({ patientId, onOpenSource }: Props) {
  const t = useT();
  const { lang } = useI18n();
  const { can } = useAppContext();
  const id = useId();
  const state = usePatientAiSummary(patientId, lang);
  if (!state.enabled || state.blocked) return null;
  if (state.loading) return <div role="status" data-testid="patient-ai-summary-loading" aria-busy="true" aria-label={t("Cargando resumen de IA")} className="flex flex-col gap-3 rounded-2xl border p-5">
    <Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" />
  </div>;
  const summary = state.summary;
  // empty/insufficient/unavailable no producen una tarjeta ficticia de contenido.
  if (!summary && !state.canGenerate) return null;
  const feedback = state.generationIssue
    ? t(state.generationIssue === "insufficient" ? "No hay datos suficientes para generar el resumen de IA." : "No se pudo generar el resumen de IA. Puedes intentarlo de nuevo.")
    : state.readIssue ? t("No pudimos consultar el resumen de IA. El resto del perfil sigue disponible.") : null;
  const actions = state.canGenerate ? <div className="flex flex-wrap items-center gap-3" data-testid="patient-ai-summary-actions">
    <Button variant="outline" className="min-h-11" disabled={state.generating} onClick={state.readIssue ? state.retry : () => void state.generate()}>
      <Sparkles data-icon="inline-start" aria-hidden="true" />
      {t(state.readIssue ? "Reintentar consulta de IA" : state.generating ? "Generando resumen de IA…" : summary ? "Actualizar resumen de IA" : "Generar resumen de IA")}
    </Button>
    {!summary && <p className="text-sm text-muted-foreground">{t("Se genera solo cuando lo solicitas.")}</p>}
  </div> : null;
  const message = feedback ? <p role="status" className="text-sm text-muted-foreground" data-testid="patient-ai-summary-feedback">
    {feedback}{summary && ` ${t("Se conserva el resumen anterior con su fecha original.")}`}
  </p> : null;
  if (!summary) return <div className="flex flex-col gap-3">{actions}{message}</div>;
  const generated = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CO", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  }).format(new Date(summary.generatedAt));
  const referenced = new Set([...summary.sourceRefs, ...summary.attention.flatMap(item => item.sourceRefs)]);
  const sources = summary.sources.filter(source => referenced.has(source.ref));
  const canOpen = (source: PatientSummarySource) => !!onOpenSource && (source.section === "nutrition"
    ? can("Nutrition.View") && can("Nutrition.RecordsView")
    : source.section === "tests" ? can("HealthTests.View") || can("HealthTests.ViewOwn")
    : source.section === "measurements" ? can("ClinicalMeasurements.View") || can("ClinicalMeasurements.ViewOwn")
    : source.section === "alerts" ? can("Program.Profile360View") : can("Program.View"));
  function reference(source: PatientSummarySource, index: number) {
    const marker = `[${index + 1}]`;
    const label = t("Ver fuente {reference}: {section}, del {from} al {to}", {
      reference: marker, section: t(patientSummarySectionLabels[source.section]),
      from: formatSummaryDate(source.from, lang), to: formatSummaryDate(source.to, lang),
    });
    return canOpen(source) ? <button type="button" key={`${source.ref}:${index}`} aria-label={label}
      className="inline-block min-h-6 min-w-6 rounded-sm px-1 font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => onOpenSource?.(source)}>{marker}</button> : <span key={`${source.ref}:${index}`}>{marker}</span>;
  }
  return <section aria-labelledby={`${id}-heading`} data-testid="patient-ai-summary" aria-busy={state.generating}>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle><h2 id={`${id}-heading`}>{t("Resumen de IA")}</h2></CardTitle>
          <Badge variant="secondary">{t("Estimado por IA")}</Badge>
        </div>
        <CardDescription>{t("Borrador para revisión profesional.")}</CardDescription>
        <p className="text-sm text-muted-foreground">{t("Del {from} al {to}", { from: formatSummaryDate(summary.startDate, lang), to: formatSummaryDate(summary.endDate, lang) })}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="max-w-prose whitespace-pre-line break-words leading-relaxed" lang={summary.language}>
          <p data-testid="patient-ai-summary-text"><CitedText text={summary.summary} sources={sources} renderReference={reference} /></p>
          {summary.attention.length > 0 && <div className="mt-5 flex flex-col gap-2">
            <h3 className="font-semibold">{t("Puntos para revisar")}</h3>
            <ul className="list-disc pl-5">{summary.attention.map((item, index) => <li key={index}><CitedText text={item.text} sources={sources} renderReference={reference} /></li>)}</ul>
          </div>}
        </div>
        {actions}{message}
      </CardContent>
      <CardFooter className="flex-col items-start gap-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" data-testid="patient-ai-summary-metadata">
          <time dateTime={summary.generatedAt} data-testid="patient-ai-generated-at">{t("Generado el {date} (UTC)", { date: generated })}</time>
          {summary.model && <span className="break-all">{t("Modelo: {model}", { model: summary.model })}</span>}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("Fuentes del resumen")}</h3>
          <ul className="flex flex-col gap-1 text-sm">{sources.map((source, index) => <li key={source.ref} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {reference(source, index)}<span>{t(patientSummarySectionLabels[source.section])}</span>
            <span className="text-muted-foreground">{formatSummaryDate(source.from, lang)} – {formatSummaryDate(source.to, lang)}</span>
          </li>)}</ul>
        </div>
      </CardFooter>
    </Card>
  </section>;
}

function CitedText({ text, sources, renderReference }: {
  text: string; sources: PatientAiSummary["sources"]; renderReference: (source: PatientSummarySource, index: number) => ReactNode;
}) {
  // Solo los descriptores conocidos generan controles locales. El texto nunca es HTML/Markdown.
  return text.split(/(\[[a-zA-Z][a-zA-Z0-9_.:-]{0,79}\])/g).map((part, index) => {
    const position = sources.findIndex(source => `[${source.ref}]` === part);
    return <span key={index}>{position < 0 ? part : renderReference(sources[position], position)}</span>;
  });
}
