"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api/http";
import { useAuth } from "@/providers/auth-provider";
import { useI18n, useT } from "@/providers/i18n-provider";
import {
  compareMotorParameters, readParameterHistory, type MotorParameterDifference, type MotorParameterHistory,
  type MotorParameterValue, type MotorParameterRevision,
} from "../services/motor-parameter-history-service";

export const parameterHistoryPath = "/settings/motor365-parameters";
export const parameterHistoryRole = "clinical_admin";

const parameterLabels: Record<string, string> = {
  floorF: "Piso energético femenino",
  floorM: "Piso energético masculino",
  step: "Paso de ajuste",
  adhMin: "Adherencia mínima",
  weighMin: "Pesajes mínimos",
  defCut: "Límite de semanas en definición",
  carbMin: "Mínimo de carbohidratos",
  proCap: "Tope de proteína",
  "fat.rest": "Grasa en descanso",
  "fat.train": "Grasa en entrenamiento",
};

const goalLabels: Record<string, string> = { bajar: "Pérdida de peso", masa: "Ganancia muscular", def: "Definición" };
const configLabels: Record<string, string> = {
  pct: "Porcentaje objetivo",
  pro: "Proteína por kilogramo",
  band: "Banda de ajuste",
  breakEvery: "Intervalo entre descargas",
};
const paceLabels: Record<string, string> = { s: "Ritmo bajo", m: "Ritmo moderado", max: "Ritmo máximo" };

function parameterLabel(path: string, t: ReturnType<typeof useT>) {
  if (parameterLabels[path]) return t(parameterLabels[path]);
  const [group, goal, pace] = path.split(".");
  if (configLabels[group] && goalLabels[goal]) {
    return [t(configLabels[group]), t(goalLabels[goal]), pace && paceLabels[pace] ? t(paceLabels[pace]) : null]
      .filter(Boolean).join(" · ");
  }
  return path;
}

type HistoryResult = MotorParameterHistory | "forbidden" | "error";

export function MotorParameterHistoryPage() {
  const { hasRole, loading, user } = useAuth();
  const t = useT();
  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <Link href="/settings" className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
        <ArrowLeft aria-hidden className="size-4" /> {t("Configuración")}
      </Link>
      <PageHeader title={t("Historial de parámetros del Motor 365")}
        description={t("Compara revisiones publicadas y consulta el motivo y el autor de cada cambio.")}
        icon={History} />
      {loading ? <HistoryLoading /> : hasRole(parameterHistoryRole) ? (
        <ParameterHistory key={user?.id} />
      ) : <PermissionDenied />}
    </div>
  );
}

function HistoryLoading() {
  const t = useT();
  return <Skeleton role="status" aria-label={t("Cargando revisiones de parámetros")} className="h-24" />;
}

function PermissionDenied() {
  const t = useT();
  return <p role="alert" className="rounded-lg border bg-card p-4 text-sm">{t("No tienes permiso para consultar este historial.")}</p>;
}

function ParameterHistory() {
  const { lang, t } = useI18n();
  const [latest, setLatest] = useState<HistoryResult>();
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<number>();
  const [more, setMore] = useState<"loading" | "error">();
  const pageRequest = useRef<AbortController>(null);

  useEffect(() => {
    const controller = new AbortController();
    void readParameterHistory(controller.signal).then(
      value => { if (!controller.signal.aborted) setLatest(value); },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setLatest(error instanceof ApiError && [401, 403].includes(error.status) ? "forbidden" : "error");
      },
    );
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => () => pageRequest.current?.abort(), []);

  async function loadEarlier(history: MotorParameterHistory) {
    if (history.nextBefore === null || pageRequest.current) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setMore("loading");
    try {
      const value = await readParameterHistory(controller.signal, history.nextBefore);
      if (!controller.signal.aborted) {
        setLatest({ versions: [...history.versions, ...value.versions], nextBefore: value.nextBefore });
        setMore(undefined);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && [401, 403].includes(error.status)) setLatest("forbidden");
      else setMore("error");
    } finally {
      pageRequest.current = null;
    }
  }

  if (!latest) return <HistoryLoading />;
  if (latest === "forbidden") return <PermissionDenied />;
  if (latest === "error") return (
    <div className="rounded-lg border bg-card p-4 text-sm">
      <p role="alert">{t("No se pudo consultar el historial de parámetros.")}</p>
      <Button variant="outline" type="button" className="mt-3" onClick={() => { setLatest(undefined); setAttempt(value => value + 1); }}>
        {t("Reintentar")}
      </Button>
    </div>
  );

  const [current, ...older] = latest.versions;
  const previous = selection ?? older[0]?.version;
  const time = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      {current && <Card>
        <CardHeader><h2 className="text-base font-semibold">{t("Comparar con la versión vigente")}</h2></CardHeader>
        <CardContent className="min-w-0 space-y-4">
          {older.length === 0 ? (
            <p className="text-muted-foreground">{t("Todavía no hay revisiones anteriores para comparar.")}</p>
          ) : <>
            <label className="flex max-w-md flex-col gap-1 font-medium">
              {t("Versión a comparar")}
              <select value={previous} onChange={event => setSelection(Number(event.target.value))}
                className="min-h-11 rounded-lg border border-input bg-background px-3">
                {older.map(revision => <option key={revision.version} value={revision.version}>
                  {t("Versión {version}", { version: String(revision.version) })}
                  {revision.defaults ? ` · ${t("Referencia del motor")}` : ""}
                </option>)}
              </select>
            </label>
            {previous !== undefined && <ParameterComparison key={`${current.version}:${previous}`}
              previous={previous} current={current.version} />}
          </>}
        </CardContent>
      </Card>}
      <Card>
        <CardHeader><h2 className="text-base font-semibold">{t("Versiones publicadas")}</h2></CardHeader>
        <CardContent className="min-w-0 space-y-2">
          <ul role="list" className="divide-y">
            {latest.versions.map(version => <VersionLine key={version.version} revision={version}
              current={version.version === current?.version} formatDate={time.format} />)}
          </ul>
          {more === "error" && <p role="alert">{t("No se pudieron cargar las versiones anteriores.")}</p>}
          {latest.nextBefore !== null && <Button variant="outline" disabled={more === "loading"}
            type="button" onClick={() => void loadEarlier(latest)}>
            {more === "loading" ? t("Cargando revisiones de parámetros") : t("Cargar versiones anteriores")}
          </Button>}
        </CardContent>
      </Card>
    </>
  );
}

function VersionLine({ revision, current, formatDate }: {
  revision: MotorParameterRevision;
  current: boolean;
  formatDate: (date: Date) => string;
}) {
  const t = useT();
  return <li className="min-w-0 space-y-1 py-3">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-semibold">{t("Versión {version}", { version: String(revision.version) })}</span>
      {current && <Badge variant="outline">{t("Vigente")}</Badge>}
      <span className="text-muted-foreground">{t("Motor {version}", { version: revision.engineVersion })}</span>
      {revision.publishedAt && <time dateTime={revision.publishedAt} className="text-muted-foreground">
        {formatDate(new Date(revision.publishedAt))}
      </time>}
    </div>
    <p className="wrap-anywhere">{revision.defaults ? t("Referencia del motor") : revision.reason}</p>
    {revision.changedBy && <p className="wrap-anywhere text-muted-foreground">
      {t("Autor (ID)")} <code className="font-mono text-xs">{revision.changedBy}</code>
    </p>}
  </li>;
}

function ParameterComparison({ previous, current }: { previous: number; current: number }) {
  const { lang, t } = useI18n();
  const title = useId();
  const [result, setResult] = useState<MotorParameterDifference[] | "denied" | "error">();
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void compareMotorParameters(previous, current, controller.signal).then(
      comparison => { if (!controller.signal.aborted) setResult(comparison); },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult(error instanceof ApiError && [401, 403].includes(error.status) ? "denied" : "error");
      },
    );
    return () => controller.abort();
  }, [previous, current, retry]);

  if (!result) return <HistoryLoading />;
  if (result === "denied") return <PermissionDenied />;
  if (result === "error") return <>
    <p role="alert">{t("No se pudieron comparar estas versiones.")}</p>
    <Button type="button" variant="outline" onClick={() => { setResult(undefined); setRetry(value => value + 1); }}>
      {t("Reintentar")}
    </Button>
  </>;
  if (result.length === 0) return <p role="status" className="text-muted-foreground">{t("Estas versiones tienen los mismos parámetros.")}</p>;

  const formatNumber = new Intl.NumberFormat(lang, { useGrouping: false, maximumSignificantDigits: 21 });
  const format = (value: MotorParameterValue | undefined): string => {
    if (value === undefined) return t("Sin valor");
    if (Array.isArray(value)) return value.map(format).join(" / ");
    return typeof value === "number" ? formatNumber.format(value) : JSON.stringify(value);
  };
  return (
    <div>
      <h3 id={title} className="sr-only">{t("Diferencias de parámetros")}</h3>
      <Table aria-labelledby={title}>
        <TableHeader><TableRow>
          <TableHead>{t("Parámetro")}</TableHead>
          <TableHead>{t("Versión {version}", { version: String(previous) })}</TableHead>
          <TableHead>{t("Versión {version}", { version: String(current) })}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {result.map(change => <TableRow key={change.path}>
            <TableCell className="max-w-52 whitespace-normal font-medium">{parameterLabel(change.path, t)}</TableCell>
            <TableCell className="whitespace-normal tabular-nums">{format(change.before)}</TableCell>
            <TableCell className="whitespace-normal tabular-nums">{format(change.after)}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </div>
  );
}
