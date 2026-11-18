"use client";

import { useT } from "@/providers/i18n-provider";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Droplets,
  Gauge,
  HeartPulse,
  RefreshCw,
  Thermometer,
  Weight,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { ClinicalMeasurement } from "../services/clinical-measurement-mapper";
import { getPatientMeasurements } from "../services/patients-service";

/** Estilos de la caja de icono por tono semántico (misma paleta que la página). */
const TONES = {
  primary: "bg-primary/20 text-primary ring-1 ring-primary/40",
  info: "bg-info/20 text-info ring-1 ring-info/40",
  success: "bg-success/20 text-success ring-1 ring-success/40",
  warning: "bg-warning/20 text-warning ring-1 ring-warning/40",
  destructive: "bg-destructive/20 text-destructive ring-1 ring-destructive/40",
} as const;

type Tone = keyof typeof TONES;

/** Batches visibles por defecto; el resto queda bajo "Ver historial". */
const VISIBLE_BATCHES = 3;

interface MetricVisual {
  icon: LucideIcon;
  tone: Tone;
  /** Key i18n del label; null → fallback con `metricName · metricCode`. */
  labelKey: string | null;
}

/** Mapa de metricCode → presentación (icono, tono, label i18n). */
const METRIC_MAP: Record<string, MetricVisual> = {
  heart_rate: {
    icon: HeartPulse,
    tone: "destructive",
    labelKey: "Frecuencia cardíaca",
  },
  systolic_bp: { icon: Gauge, tone: "primary", labelKey: "Presión sistólica" },
  diastolic_bp: {
    icon: Gauge,
    tone: "primary",
    labelKey: "Presión diastólica",
  },
  o2_saturation: { icon: Wind, tone: "success", labelKey: "Saturación O₂" },
  glucose_fasting: { icon: Droplets, tone: "warning", labelKey: "Glucosa" },
  weight: { icon: Weight, tone: "info", labelKey: "Peso" },
  temperature_c: { icon: Thermometer, tone: "warning", labelKey: "Temperatura" },
};

/** Métrica desconocida: nunca rompe, muestra el código crudo como fallback. */
const FALLBACK_VISUAL: MetricVisual = {
  icon: Activity,
  tone: "primary",
  labelKey: null,
};

/** Agrupa por lote en orden de la API. Cada medición sin lote va en su propia tarjeta. */
function groupMeasurements(measurements: ClinicalMeasurement[]) {
  const groups = new Map<string, ClinicalMeasurement[]>();
  for (const measurement of measurements) {
    const key = measurement.batchId ?? measurement.id;
    const group = groups.get(key);
    if (group) group.push(measurement);
    else groups.set(key, [measurement]);
  }
  return [...groups.values()];
}

export function ClinicalMeasurementsSection({
  patientId,
}: {
  patientId: string;
}) {
  const t = useT();
  const [measurements, setMeasurements] = useState<ClinicalMeasurement[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Carga propia: los setState solo ocurren tras el await (nunca síncronos en
  // el efecto). reloadKey fuerza la recarga desde el botón "Reintentar".
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getPatientMeasurements(patientId);
        if (!active) return;
        setMeasurements(data);
        setError(null);
      } catch {
        if (!active) return;
        setError("No pudimos cargar las mediciones");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  }, []);

  const { historyGroups, recentGroups, currentCount } = useMemo(() => {
    const current = measurements.filter((measurement) => !measurement.isSuperseded);
    const historyGroups = groupMeasurements(measurements);
    const currentGroups =
      current.length === measurements.length ? historyGroups : groupMeasurements(current);
    return {
      historyGroups,
      recentGroups: currentGroups.slice(0, VISIBLE_BATCHES),
      currentCount: current.length,
    };
  }, [measurements]);

  const visibleGroups = expanded ? historyGroups : recentGroups;
  const hiddenCount = historyGroups.length - recentGroups.length;
  const hasHistory = hiddenCount > 0 || currentCount < measurements.length;

  return (
    <section
      className="flex flex-col overflow-hidden rounded-2xl border border-brand-blue-soft/40 bg-card shadow-xs"
      aria-label={t("Mediciones clínicas")}
    >
      <SectionHeader
        title={t("Mediciones clínicas")}
        description={t("{count} mediciones registradas", {
          count: String(currentCount),
        })}
        icon={HeartPulse}
        variant="primary"
      />

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {loading ? (
          <MeasurementsSkeleton />
        ) : error ? (
          <div
            className="flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-destructive-soft/40 py-8 text-center"
            role="alert"
          >
            <p className="text-sm font-semibold text-destructive">
              {t("No pudimos cargar las mediciones")}
            </p>
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw data-icon="inline-start" />
              {t("Reintentar")}
            </Button>
          </div>
        ) : historyGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("Sin mediciones registradas.")}
          </p>
        ) : (
          <>
            {visibleGroups.length > 0 && (
              <ul className="flex flex-col gap-3">
                {visibleGroups.map((group) => (
                  <MeasurementCard
                    key={group[0].batchId ?? group[0].id}
                    group={group}
                  />
                ))}
              </ul>
            )}
            {hasHistory && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <>
                    <ChevronUp data-icon="inline-start" />
                    {t("Ver menos")}
                  </>
                ) : (
                  <>
                    <ChevronDown data-icon="inline-start" />
                    {t("Ver historial")}
                    {hiddenCount > 0 && ` (${hiddenCount})`}
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Tarjeta de un lote con la procedencia de cada medición. */
function MeasurementCard({ group }: { group: ClinicalMeasurement[] }) {
  const t = useT();
  const locale = getDateLocale();
  return (
    <li className="@container rounded-xl border border-border bg-muted/30 p-3">
      <p className="mb-3 text-xs font-semibold text-foreground">
        {formatDateTime(group[0].observedAt, locale)}
      </p>
      <ul className="grid grid-cols-1 gap-2 @sm:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4">
        {group.map((measurement) => {
          const visual =
            METRIC_MAP[measurement.metricCode] ?? FALLBACK_VISUAL;
          const Icon = visual.icon;
          const label = visual.labelKey
            ? t(visual.labelKey)
            : `${measurement.metricName} · ${measurement.metricCode}`;
          const sourceLabel = measurement.sourceLabel && t(measurement.sourceLabel);
          const statusLabel = measurement.isSuperseded ? t("Reemplazado") : null;

          return (
            <li
              key={measurement.id}
              className="flex min-w-0 flex-col gap-2 rounded-lg bg-card px-2.5 py-2"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${TONES[visual.tone]}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 wrap-anywhere">
                  <span className="block text-xs text-muted-foreground">
                    {label}
                  </span>
                  <span className="block text-sm font-semibold">
                    {measurement.value.toLocaleString(locale, { maximumFractionDigits: 1 })}{" "}
                    {measurement.unitSymbol}
                  </span>
                </span>
              </div>
              {(sourceLabel || statusLabel) && (
                <div className="flex flex-wrap gap-1.5">
                  {sourceLabel && <MeasurementBadge label={sourceLabel} />}
                  {statusLabel && <MeasurementBadge label={statusLabel} historical />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function MeasurementBadge({ label, historical }: { label: string; historical?: boolean }) {
  return (
    <Badge
      variant={historical ? "outline" : "secondary"}
      role="group"
      aria-label={label}
      className="h-auto min-h-5 max-w-full justify-start text-start whitespace-normal wrap-anywhere"
    >
      <span aria-hidden="true">{label}</span>
    </Badge>
  );
}

/** Skeleton con la forma de la sección (encabezado + tarjetas de check-in). */
function MeasurementsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

function formatDateTime(date: string, locale: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
