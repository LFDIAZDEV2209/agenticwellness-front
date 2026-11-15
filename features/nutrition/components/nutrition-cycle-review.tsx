"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, ArrowRight, ClipboardList, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppContext } from "@/providers/context-provider";
import { useT } from "@/providers/i18n-provider";
import { useNutritionResource } from "../hooks/use-nutrition-resource";
import { fetchNutritionPeriod } from "../services/nutrition-cycle-review-service";
import type { NutritionCycleHeader } from "../types/nutrition";
import {
  NutritionPeriodSummary,
  NutritionPeriodComparison,
} from "./nutrition-period-summary";
import { NutritionCycleRecords } from "./nutrition-cycle-records";
import { NutritionCycleClosing } from "./nutrition-cycle-closing";
import {
  useNutritionDate,
  useNutritionNumber,
  NutritionPatientAvatar,
} from "./nutrition-shared";
import "../nutrition-cycle-review.css";
import "../nutrition-cycle-closing.css";

interface Props {
  patientId: string;
  patientName: string;
  headers: NutritionCycleHeader[];
  selectedId?: string;
  today: string | null;
  timezone: string | null;
  onBack: () => void;
  openInbox: () => void;
  onNavigationLock?: (locked: boolean) => void;
}
const steps = [
  "Resumen del período",
  "Comparación con el ciclo anterior",
  "Registros y ejemplos",
  "Evaluación",
  "Ajustes del plan",
  "Validación",
  "Publicación",
];
const stateLabels = {
  borrador: "Sin publicación",
  en_curso: "En curso",
  por_revisar: "Por revisar",
  revisado: "Revisado",
  interrumpido: "Interrumpido",
} as const;

export function NutritionCycleReview(props: Props) {
  const { can } = useAppContext();
  const t = useT();
  const cycleId = props.headers.find(
    (row) => row.id === props.selectedId,
  )?.cycleId;
  if (
    !can("Nutrition.View") ||
    !can("Nutrition.RecordsView") ||
    !can("Nutrition.Manage")
  )
    return (
      <div className="nutrition-review-notice">
        <p>{t("No tienes permiso para preparar el cierre de este ciclo.")}</p>
        <Button variant="outline" onClick={props.onBack}>
          {t("Volver a la ficha")}
        </Button>
      </div>
    );
  if (!cycleId || !props.today || !props.timezone)
    return (
      <div className="nutrition-review-notice">
        <p>
          {t(
            "No hay un ciclo y una zona horaria disponibles para revisar el período.",
          )}
        </p>
        <Button variant="outline" onClick={props.onBack}>
          {t("Volver a la ficha")}
        </Button>
      </div>
    );
  return (
    <ReviewScreen
      key={`${props.patientId}:${cycleId}`}
      {...props}
      cycleId={cycleId}
      today={props.today}
      timezone={props.timezone}
    />
  );
}

function ReviewScreen({
  patientId,
  patientName,
  headers,
  selectedId,
  cycleId,
  today,
  timezone,
  onBack,
  openInbox,
  onNavigationLock,
}: Props & { cycleId: string; today: string; timezone: string }) {
  const t = useT();
  const date = useNutritionDate();
  const number = useNutritionNumber();
  const id = useId();
  const [active, setActive] = useState(0);
  const [closingLocked, setClosingLocked] = useState(false);
  useEffect(() => {
    onNavigationLock?.(closingLocked);
    return () => onNavigationLock?.(false);
  }, [closingLocked, onNavigationLock]);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchNutritionPeriod(patientId, cycleId, today, timezone, signal),
    [patientId, cycleId, today, timezone],
  );
  const current = useNutritionResource(load);
  const a = current.data?.adherence;
  const currentNumber = a?.number;
  const previousId = a?.startDate
    ? [...headers]
        .filter(
          (row) =>
            row.cycleId !== cycleId &&
            row.startDate &&
            row.startDate < a.startDate! &&
            (row.isPublished ||
              row.state === "aprobado" ||
              row.state === "por_renovar"),
        )
        .sort((x, y) => y.startDate!.localeCompare(x.startDate!))[0]?.cycleId
    : undefined;
  const loadPrevious = useCallback(
    async (signal: AbortSignal) => {
      if (!previousId) return null;
      const period = await fetchNutritionPeriod(
        patientId,
        previousId,
        today,
        timezone,
        signal,
      );
      if (
        period.adherence.number === null ||
        currentNumber == null ||
        period.adherence.number !== currentNumber - 1
      )
        throw new Error("previous-cycle-number-contract");
      return period;
    },
    [previousId, patientId, today, timezone, currentNumber],
  );
  const previous = useNutritionResource(loadPrevious);
  function go(index: number) {
    setActive(index);
    sectionRefs.current[index]?.scrollIntoView({
      block: "start",
      behavior: "auto",
    });
    sectionRefs.current[index]
      ?.querySelector<HTMLElement>("h2")
      ?.focus({ preventScroll: true });
  }
  function header(index: number) {
    return (
      <header className="nutrition-review-section-header">
        <span className="nutrition-review-step-number" aria-hidden="true">
          {index + 1}
        </span>
        <h2 id={`${id}-${index}`} tabIndex={-1}>
          {t(steps[index])}
        </h2>
        <span>
          {t(index < 2 ? "Lectura del período" : "Selección profesional")}
        </span>
      </header>
    );
  }
  return (
    <div className="nutrition-cycle-review">
      <div className="nutrition-review-toolbar">
        <Button variant="ghost" onClick={onBack} disabled={closingLocked}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("Volver a la ficha")}
        </Button>
        <Button
          variant="outline"
          disabled={current.loading || closingLocked}
          onClick={() => {
            current.retry();
            previous.retry();
          }}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {t("Actualizar período")}
        </Button>
      </div>
      <header className="nutrition-review-hero">
        <NutritionPatientAvatar name={patientName} size="lg" />
        <div>
          <h1>
            {a?.number
              ? t("Revisión del ciclo {cycle} · {name}", {
                  cycle: String(a.number),
                  name: patientName,
                })
              : t("Revisión del período · {name}", { name: patientName })}
          </h1>
          <p>
            {a?.startDate && a.endDate
              ? `${date(a.startDate)} – ${date(a.endDate)}`
              : t("Período por confirmar")}{" "}
            · {timezone}
          </p>
          {a && (
            <p>
              {t(stateLabels[a.state])}
              {a.through &&
                ` · ${t("Lectura hasta {date}", { date: date(a.through) })}`}
              {a.endDate &&
                a.through &&
                a.through > a.endDate &&
                ` · ${t("En continuidad")}`}
            </p>
          )}
        </div>
        {a && (
          <dl>
            <div>
              <dt>{t("Días con registros")}</dt>
              <dd>{number(a.daysWithData, 0)}</dd>
            </div>
            <div>
              <dt>{t("Adherencia del ciclo")}</dt>
              <dd>
                {a.adherence === null
                  ? t("Sin dato")
                  : `${number(a.adherence * 100)} %`}
              </dd>
            </div>
          </dl>
        )}
      </header>
      <p className="nutrition-review-read-notice">
        {t(
          "Revisa el período, prepara el plan siguiente y valida el mensaje. Guardar el cierre no lo publica.",
        )}
      </p>
      <div className="nutrition-review-layout">
        <aside className="nutrition-review-sidebar">
          <nav aria-label={t("Pasos del cierre")}>
            <ol>
              {steps.map((label, index) => (
                <li key={label}>
                  <button
                    type="button"
                    aria-current={active === index ? "step" : undefined}
                    onClick={() => go(index)}
                  >
                    <span aria-hidden="true">{index + 1}</span>
                    <span>{t(label)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <p>
            {t(
              "Guarda la evaluación y el mensaje para retomar el cierre. La publicación conjunta requiere confirmación.",
            )}
          </p>
        </aside>
        <div className="nutrition-review-sections">
          {current.loading ? (
            <div
              className="nutrition-review-section"
              role="status"
              aria-label={t("Cargando revisión del período")}
            >
              <span className="sr-only">
                {t("Cargando revisión del período")}
              </span>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="mt-4 h-72 w-full" />
            </div>
          ) : current.error || !current.data ? (
            <div
              className="nutrition-review-notice"
              role="alert"
              aria-label={t("No pudimos cargar el período")}
            >
              <h2>{t("No pudimos cargar el período")}</h2>
              <p>
                {t(
                  "No se muestran cifras incompletas. Reintenta la lectura del ciclo y sus registros.",
                )}
              </p>
              <Button variant="outline" onClick={current.retry}>
                {t("Reintentar período")}
              </Button>
            </div>
          ) : (
            <>
              <section
                ref={(element) => {
                  sectionRefs.current[0] = element;
                }}
                className="nutrition-review-section"
                aria-labelledby={`${id}-0`}
              >
                {header(0)}
                <div className="nutrition-review-section-body">
                  {!a?.number || !a.elapsedDays ? (
                    <p className="nutrition-review-notice">
                      {t(
                        "Este ciclo todavía no tiene fechas publicadas transcurridas.",
                      )}
                    </p>
                  ) : (
                    <NutritionPeriodSummary period={current.data} />
                  )}
                  <Button variant="outline" onClick={() => go(1)}>
                    {t("Ir a comparación")}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </section>
              <section
                ref={(element) => {
                  sectionRefs.current[1] = element;
                }}
                className="nutrition-review-section"
                aria-labelledby={`${id}-1`}
              >
                {header(1)}
                <div className="nutrition-review-section-body">
                  {!previousId ? (
                    <p className="nutrition-review-notice">
                      {t(
                        "No hay un ciclo anterior publicado con el que comparar.",
                      )}
                    </p>
                  ) : previous.loading ? (
                    <div
                      role="status"
                      aria-label={t("Cargando ciclo anterior")}
                    >
                      <Skeleton className="h-48 w-full" />
                    </div>
                  ) : previous.error || !previous.data ? (
                    <div
                      className="nutrition-review-notice"
                      role="alert"
                      aria-label={t("No pudimos cargar el ciclo anterior")}
                    >
                      <p>
                        {t(
                          "No pudimos cargar el ciclo anterior. El período actual sigue disponible.",
                        )}
                      </p>
                      <Button variant="outline" onClick={previous.retry}>
                        {t("Reintentar comparación")}
                      </Button>
                    </div>
                  ) : (
                    <NutritionPeriodComparison
                      current={current.data}
                      previous={previous.data}
                    />
                  )}
                  <Button variant="outline" onClick={() => go(2)}>
                    {t("Ir a registros y ejemplos")}
                    <ClipboardList className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </section>
              <section
                ref={(element) => {
                  sectionRefs.current[2] = element;
                }}
                className="nutrition-review-section"
                aria-labelledby={`${id}-2`}
              >
                {header(2)}
                <div className="nutrition-review-section-body">
                  <NutritionCycleRecords
                    days={current.data.days}
                    retry={() => {
                      if (!closingLocked) current.retry();
                    }}
                    openInbox={openInbox}
                    navigationLocked={closingLocked}
                  />
                </div>
              </section>
              <NutritionCycleClosing
                patientId={patientId}
                cycleId={cycleId}
                sourceId={
                  selectedId ??
                  headers.find((row) => row.cycleId === cycleId)?.id ??
                  ""
                }
                period={current.data.adherence}
                today={today}
                timezone={timezone}
                onLock={setClosingLocked}
                section={(index: number, body: ReactNode) => (
                  <section
                    key={index}
                    ref={(element) => {
                      sectionRefs.current[index] = element;
                    }}
                    className="nutrition-review-section"
                    aria-labelledby={`${id}-${index}`}
                  >
                    {header(index)}
                    <div className="nutrition-review-section-body">{body}</div>
                  </section>
                )}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
