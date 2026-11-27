"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Download, ListChecks } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/http";
import { useAuth } from "@/providers/auth-provider";
import { useAppContext } from "@/providers/context-provider";
import { useI18n, useT } from "@/providers/i18n-provider";
import { exportMotorTimeline, readMotorTimeline, type MotorEventFilter } from "../services/motor-timeline-service";

const startFilters: MotorEventFilter = { from: "", to: "", kind: "" };
const profilePath = (patientId: string) => `/patients/${encodeURIComponent(patientId)}/360`;

export function MotorTimelineLink({ patientId }: { patientId: string }) {
  const t = useT();
  const { user } = useAuth();
  const { can } = useAppContext();
  if (!user || !can("Program.Profile360View")) return null;
  return <Link href={`${profilePath(patientId)}/motor-timeline`} className={`${buttonVariants({ variant: "outline" })} mb-4 ml-auto flex min-h-11 w-fit`}>
    <ListChecks aria-hidden="true" />{t("Bitácora del Motor 365")}
  </Link>;
}

export function MotorTimeline({ patientId }: { patientId: string }) {
  const t = useT();
  const { user, loading } = useAuth();
  const { activeClinicId, can, loading: contextLoading } = useAppContext();
  const mayView = user && can("Program.Profile360View");
  return <section className="mx-auto grid max-w-5xl gap-5 p-4 sm:p-6">
    <header className="grid gap-2">
      <Link href={profilePath(patientId)} className={`${buttonVariants({ variant: "ghost" })} min-h-11 justify-self-start`}>
        <ArrowLeft aria-hidden="true" />{t("Volver al Perfil 360")}
      </Link>
      <h1 className="font-heading text-2xl font-semibold">{t("Bitácora del Motor 365")}</h1>
      <p className="text-sm text-muted-foreground">{t("Última versión registrada de cada decisión del motor. Las fechas corresponden al registro en UTC.")}</p>
    </header>
    {mayView ? <TimelineContent key={`${patientId}:${user.id}:${activeClinicId ?? ""}`} patientId={patientId} mayExport={can("Program.Export")} />
      : loading || (user && contextLoading) ? <Pending /> : <Denied />}
  </section>;
}

function Pending() {
  const t = useT();
  return <div role="status"><span className="sr-only">{t("Cargando historial")}</span><Skeleton className="h-28" /></div>;
}

function Denied() {
  const t = useT();
  return <p role="alert" className="rounded-xl border p-4">{t("No tienes acceso a la bitácora de esta persona.")}</p>;
}

function TimelineContent({ patientId, mayExport }: { patientId: string; mayExport: boolean }) {
  const t = useT();
  const { lang } = useI18n();
  const [selection, setSelection] = useState({ filters: startFilters, page: 1 });
  const [result, setResult] = useState<{
    selection: typeof selection;
    data?: Awaited<ReturnType<typeof readMotorTimeline>>;
    denied?: boolean;
  }>();
  const [filterError, setFilterError] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const exportRequest = useRef<AbortController | null>(null);
  const current = result?.selection === selection ? result : undefined;
  const data = current?.data;
  const kinds = { ajuste: t("Ajuste semanal"), sin: t("Semana sin ajuste"), meta: t("Meta alcanzada"), modo: t("Cambio de fase") };
  const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const numberFormat = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });

  useEffect(() => {
    const request = new AbortController();
    readMotorTimeline(patientId, selection.filters, selection.page, request.signal)
      .then(data => { if (!request.signal.aborted) setResult({ selection, data }); })
      .catch((error: unknown) => {
        if (!request.signal.aborted) setResult({ selection, denied: error instanceof ApiError && [401, 403, 404].includes(error.status) });
      });
    return () => request.abort();
  }, [patientId, selection]);

  useEffect(() => () => exportRequest.current?.abort(), [mayExport, patientId, selection]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const filters = { from: String(values.get("from") ?? ""), to: String(values.get("to") ?? ""), kind: String(values.get("kind") ?? "") };
    setFilterError(Boolean(filters.from && filters.to && filters.from > filters.to));
    if (filters.from && filters.to && filters.from > filters.to) return;
    setExportError(false);
    setSelection({ filters, page: 1 });
  }

  async function download() {
    if (!data?.events.length || !mayExport || exportRequest.current) return;
    const request = new AbortController();
    exportRequest.current = request;
    setDownloading(true);
    setExportError(false);
    try {
      const file = await exportMotorTimeline(patientId, selection.filters, lang, request.signal);
      if (request.signal.aborted) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "motor-365-events.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!request.signal.aborted) setExportError(true);
    } finally {
      exportRequest.current = null;
      setDownloading(false);
    }
  }

  if (current?.denied) return <Denied />;
  return <>
    <form onSubmit={applyFilters} className="grid min-w-0 grid-cols-1 items-end gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
      <label className="grid min-w-0 gap-1 text-sm font-medium">{t("Desde (UTC)")}<Input type="date" name="from" className="min-h-11" /></label>
      <label className="grid min-w-0 gap-1 text-sm font-medium">{t("Hasta (UTC)")}<Input type="date" name="to" className="min-h-11" /></label>
      <label className="grid min-w-0 gap-1 text-sm font-medium">{t("Tipo de evento")}
        <select name="kind" className="min-h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
          <option value="">{t("Todos los tipos")}</option>
          {Object.entries(kinds).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
        </select>
      </label>
      <Button type="submit" className="min-h-11">{t("Aplicar filtros")}</Button>
      {filterError && <p role="alert" className="text-sm text-destructive sm:col-span-4">{t("La fecha inicial no puede ser posterior a la final.")}</p>}
    </form>
    {!current ? <Pending /> : !data ? <div role="alert" className="rounded-xl border p-4">
      <p>{t("No se pudo cargar la bitácora.")}</p>
      <Button variant="outline" className="mt-3 min-h-11" onClick={() => setSelection({ ...selection })}>{t("Reintentar")}</Button>
    </div> : <>
      {mayExport && data.events.length > 0 && <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={downloading} className="min-h-11" onClick={() => void download()}>
          <Download aria-hidden="true" />{t("Descargar CSV")}
        </Button>
        {exportError && <p role="alert" className="text-sm text-destructive">{t("No se pudo exportar la bitácora.")}</p>}
      </div>}
      {!data.events.length && <p role="status" className="rounded-xl border p-4 text-muted-foreground">
        {t("No hay eventos registrados para estos filtros.")}
      </p>}
      {data.events.length > 0 && <ol aria-label={t("Eventos del motor")} className="grid gap-3">
        {data.events.map(item => <li key={item.id} className="grid min-w-0 gap-2 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="font-medium">{kinds[item.kind]}</h2>
            <time dateTime={item.occurredAt} className="text-sm text-muted-foreground">{dateFormat.format(new Date(item.occurredAt))}</time>
          </div>
          <p className="break-words text-sm">{lang === "en" ? item.messageEn : item.messageEs}</p>
          <p className="break-words text-sm text-muted-foreground">
            {t("Día {day} · plan {plan} · parámetros {params} · motor {engine}", { day: String(item.day), plan: String(item.planVersion), params: String(item.parametersVersion), engine: item.engineVersion })}
          </p>
          {item.calorieDelta !== null && <p className="text-sm">{t("Cambio de energía: {amount} kcal", { amount: numberFormat.format(item.calorieDelta) })}</p>}
          {item.ratePercent !== null && <p className="text-sm">{t("Tasa registrada: {rate} %", { rate: numberFormat.format(item.ratePercent) })}</p>}
        </li>)}
      </ol>}
      {(data.page > 1 || data.hasNext) && <nav aria-label={t("Paginación de eventos")} className="flex flex-wrap items-center gap-3">
        <Button variant="outline" className="min-h-11" disabled={data.page <= 1} onClick={() => setSelection({ ...selection, page: selection.page - 1 })}>{t("Página anterior")}</Button>
        <span className="text-sm text-muted-foreground">{t("Página {page}", { page: String(data.page) })}</span>
        <Button variant="outline" className="min-h-11" disabled={!data.hasNext} onClick={() => setSelection({ ...selection, page: selection.page + 1 })}>{t("Página siguiente")}</Button>
      </nav>}
    </>}
  </>;
}
