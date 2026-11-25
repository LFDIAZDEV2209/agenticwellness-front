"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Check, Clock3, Download, Minus } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/http";
import { cn } from "@/lib/utils";
import { useI18n, useT } from "@/providers/i18n-provider";
import {
  fetchYear365Export,
  fetchYear365Report,
  type Year365ExportFormat,
  type Year365Measurement,
  type Year365Report,
} from "../services/year-365-service";

type ReportOutcome =
  | { report: Year365Report | null }
  | { denied: boolean };

export function ProgramYear365Tab({
  patientId, mayExport, refresh,
}: {
  patientId: string;
  mayExport: boolean;
  refresh: number;
}) {
  const t = useT();
  const { lang } = useI18n();
  const monthLabelId = useId();
  const [month, setMonth] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    month: string | null;
    attempt: number;
    refresh: number;
    outcome: ReportOutcome;
  } | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const activeDownload = useRef<AbortController | null>(null);

  useEffect(() => () => activeDownload.current?.abort(), [patientId, mayExport, refresh]);

  useEffect(() => {
    const request = new AbortController();
    fetchYear365Report(patientId, month, request.signal)
      .then(({ report }) => {
        if (request.signal.aborted) return;
        setMonths(report?.months ?? []);
        setResult({ month, attempt, refresh, outcome: { report } });
      })
      .catch((error: unknown) => {
        if (request.signal.aborted) return;
        const denied = error instanceof ApiError && [401, 403, 404].includes(error.status);
        if (denied) setMonths([]);
        setResult({
          month,
          attempt,
          refresh,
          outcome: { denied },
        });
      });
    return () => request.abort();
  }, [patientId, month, attempt, refresh]);

  const outcome = result?.month === month && result.attempt === attempt && result.refresh === refresh
    ? result.outcome : null;
  const lastReport = result && "report" in result.outcome ? result.outcome.report : null;
  const report = outcome && "report" in outcome ? outcome.report : null;
  const monthFormat = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" });
  const shortDateFormat = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  const programDateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" });
  const fullDateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "full", timeZone: "UTC" });
  const civilDate = (date: string) => new Date(`${date}T00:00:00Z`);
  const formatDay = (date: string) => shortDateFormat.format(civilDate(date));
  const formatNumber = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format;
  const noData = t("Sin dato");
  const metric = (measurement: Year365Measurement | null, unit: string): { value: string; date?: string } => measurement
    ? { value: `${formatNumber(measurement.value)} ${unit}`, date: formatDay(measurement.date) }
    : { value: noData };
  const dayCount = (value: number | null) => value === null ? noData : formatNumber(value);

  function selectMonth(value: string) {
    activeDownload.current?.abort();
    setDownloadError(false);
    setMonth(value);
  }

  async function download(format: Year365ExportFormat) {
    if (!report || !mayExport || activeDownload.current) return;
    const request = new AbortController();
    activeDownload.current = request;
    setDownloading(true);
    setDownloadError(false);
    try {
      const file = await fetchYear365Export(patientId, report.month, format, lang, request.signal);
      if (request.signal.aborted) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `year-365-${report.month}.${format}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!request.signal.aborted) setDownloadError(true);
    } finally {
      activeDownload.current = null;
      setDownloading(false);
    }
  }

  return (
    <section aria-label={t("Año 365")} className="grid min-w-0 gap-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarDays aria-hidden="true" className="size-5 text-primary" />
            <div>
              <h2 className="font-heading text-lg font-semibold">{t("Año 365")}</h2>
              {report && <p className="mt-0.5 text-sm text-muted-foreground">
                {programDateFormat.format(civilDate(report.startDate))} – {programDateFormat.format(civilDate(report.endDate))}
              </p>}
            </div>
          </div>
          {months.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor={monthLabelId} className="text-sm font-medium">{t("Mes")}</label>
              <select
                id={monthLabelId}
                value={month ?? lastReport?.month ?? ""}
                onChange={(event) => selectMonth(event.target.value)}
                className="min-h-10 min-w-0 max-w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              >
                {months.map((value) => (
                  <option key={value} value={value}>{monthFormat.format(civilDate(`${value}-01`))}</option>
                ))}
              </select>
            </div>
          )}
        </CardHeader>
      </Card>

      {outcome === null ? (
        <div role="status">
          <span className="sr-only">{t("Cargando historial")}</span>
          <Skeleton className="h-52 rounded-2xl" />
        </div>
      ) : "denied" in outcome ? (
        <Card><CardContent>
          <p role="alert">{outcome.denied
            ? t("No tienes acceso al historial de esta persona.")
            : t("No se pudo cargar el historial del programa.")}</p>
          {!outcome.denied && <Button variant="outline" className="mt-3" onClick={() => setAttempt(attempt + 1)}>
            {t("Reintentar")}
          </Button>}
        </CardContent></Card>
      ) : !report ? (
        <Card><CardContent role="status">{t("Esta persona aún no tiene un programa de 365 días.")}</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-heading font-semibold">{t("Resumen mensual")}</h3>
              {mayExport && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={downloading} onClick={() => void download("csv")}>
                    <Download aria-hidden="true" data-icon="inline-start" />{t("Descargar CSV")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={downloading} onClick={() => void download("pdf")}>
                    <Download aria-hidden="true" data-icon="inline-start" />{t("Descargar PDF")}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {[
                  { title: t("Adherencia"), value: report.summary.adherencePercent === null
                    ? noData : `${formatNumber(report.summary.adherencePercent)} %` },
                  { title: t("Peso"), ...metric(report.summary.weight, "kg") },
                  { title: t("Cintura"), ...metric(report.summary.waist, "cm") },
                  { title: t("Racha (días)"), value: dayCount(report.summary.streakDays) },
                  { title: t("Pausas programadas (días)"), value: dayCount(report.summary.scheduledPauseDays) },
                  { title: t("Pausas de ejercicio (días)"), value: dayCount(report.summary.safetyExercisePauseDays) },
                ].map(({ title, value, date }) => (
                  <div key={title} className="rounded-lg bg-muted/50 p-3">
                    <dt className="text-sm text-muted-foreground">{title}</dt>
                    <dd className="mt-1 font-heading text-lg font-semibold tabular-nums">{value}</dd>
                    {date && <dd className="mt-1 text-xs text-muted-foreground">{date}</dd>}
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-muted-foreground" role="status">
                {report.summary.recordedDays === 0
                  ? t("Este mes no tiene registros.")
                  : t("Días con registro: {count}", { count: String(report.summary.recordedDays) })}
              </p>
              {mayExport && downloadError && <p role="alert" className="mt-2 text-sm text-destructive">
                {t("No se pudo descargar el resumen.")}
              </p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="font-heading font-semibold">{t("Calendario del programa")}</h3></CardHeader>
            <CardContent>
              <div aria-hidden="true" className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
                {Array.from({ length: 7 }, (_, index) => {
                  const day = new Date(Date.UTC(2024, 0, index + 1));
                  return <span key={index}>{new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" }).format(day)}</span>;
                })}
              </div>
              <ol className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {report.days.map((day, index) => {
                  const date = civilDate(day.date);
                  const recorded = day.adherencePercent !== null;
                  const status = recorded ? t("Registrado") : day.future ? t("Próximo") : t("Sin registro");
                  const Icon = recorded ? Check : day.future ? Clock3 : Minus;
                  return (
                    <li
                      key={day.date}
                      data-date={day.date}
                      style={index === 0 ? { gridColumnStart: (date.getUTCDay() + 6) % 7 + 1 } : undefined}
                      className={cn("min-h-14 min-w-0 rounded-lg border p-1.5 sm:p-2",
                        recorded ? "border-primary/25 bg-primary/8" : "bg-muted/30")}
                    >
                      <time dateTime={day.date} title={fullDateFormat.format(date)} className="block font-medium tabular-nums">
                        <span aria-hidden="true">{date.getUTCDate()}</span>
                        <span className="sr-only">{fullDateFormat.format(date)}</span>
                      </time>
                      <span className="sr-only lg:not-sr-only text-xs text-muted-foreground">
                        {t("Día {day}", { day: String(day.day) })}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                        <span className="sr-only lg:not-sr-only">{status}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <ul className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground lg:hidden">
                <li className="flex items-center gap-1"><Check aria-hidden="true" className="size-3.5" />{t("Registrado")}</li>
                <li className="flex items-center gap-1"><Minus aria-hidden="true" className="size-3.5" />{t("Sin registro")}</li>
                <li className="flex items-center gap-1"><Clock3 aria-hidden="true" className="size-3.5" />{t("Próximo")}</li>
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <MeasurementChart report={report} field="weightKg" title={t("Evolución del peso")} unit="kg" formatDay={formatDay} />
            <MeasurementChart report={report} field="waistCm" title={t("Evolución de la cintura")} unit="cm" formatDay={formatDay} />
          </div>
          <Card>
            <CardHeader><h3 className="font-heading font-semibold">{t("Hitos y eventos")}</h3></CardHeader>
            <CardContent>
              {report.events.length === 0 ? <p className="text-sm text-muted-foreground">{t("Sin eventos registrados este mes.")}</p> : (
                <ul className="divide-y">
                  {report.events.map((event) => (
                    <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <span>{event.kind === "meta" ? t("Meta alcanzada")
                        : event.kind === "modo" ? t("Cambio de fase")
                        : event.kind === "ajuste" ? t("Ajuste del plan")
                        : event.kind === "sin" ? t("Evaluación sin ajuste")
                        : t("Evento del motor")}</span>
                      <time dateTime={event.date} className="text-muted-foreground">{formatDay(event.date)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

function MeasurementChart({
  report, field, title, unit, formatDay,
}: {
  report: Year365Report;
  field: "weightKg" | "waistCm";
  title: string;
  unit: "kg" | "cm";
  formatDay: (date: string) => string;
}) {
  const t = useT();
  const values = report.days.filter((day) => day[field] !== null);
  const eventDates = [...new Set(report.events.map((event) => event.date))];
  return (
    <Card>
      <CardHeader><h3 className="font-heading font-semibold">{title}</h3></CardHeader>
      <CardContent>
        {values.length === 0 ? <p className="text-sm text-muted-foreground">{t("Sin dato")}</p> : (
          <>
            <div aria-hidden="true" className="h-52 w-full">
              <ResponsiveContainer>
                <LineChart data={report.days} accessibilityLayer={false} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={formatDay} minTickGap={24} fontSize={11} />
                  <YAxis domain={["auto", "auto"]} width={46} unit={` ${unit}`} fontSize={11} />
                  <Tooltip labelFormatter={(date) => formatDay(String(date))} formatter={(value) => `${value} ${unit}`} />
                  {eventDates.map((date) => <ReferenceLine key={date} x={date} stroke="var(--muted-foreground)" strokeDasharray="4 4" />)}
                  <Line dataKey={field} stroke="var(--primary)" strokeWidth={2} dot connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul className="sr-only" aria-label={title}>
              {values.map((day) => <li key={day.date}>{formatDay(day.date)} · {day[field]} {unit}</li>)}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
