"use client";

import { useCallback, useState } from "react";
import {
  Check,
  CircleDashed,
  CircleMinus,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppContext } from "@/providers/context-provider";
import { useT } from "@/providers/i18n-provider";
import { useNutritionResource } from "../hooks/use-nutrition-resource";
import { useIntakeReviews } from "../hooks/use-intake-reviews";
import {
  NutritionIntakeReviewActions,
  IntakeReviewStatus,
} from "./nutrition-intake-review";
import {
  NutritionIntakeHighlightActions,
  useIntakeHighlights,
} from "./nutrition-intake-highlights";
import {
  NutritionIntakeFilters,
  emptyIntakeFilters,
  filterIntakeRecords,
  hasIntakeFilters,
  type IntakeFilters,
} from "./nutrition-intake-filters";
import {
  addIntakeDays,
  fetchNutritionIntake,
  intakeDate,
  intakeDates,
} from "../services/nutrition-intake-service";
import type { NutritionCycleHeader } from "../types/nutrition";
import type { IntakeDay } from "../types/nutrition-intake";
import { groupNutritionCycles } from "./nutrition-program-cycles";
import { NutritionIntakeDay } from "./nutrition-intake-day";
import { useNutritionDate } from "./nutrition-shared";
import "../nutrition-intake.css";
const noIntakeDays: IntakeDay[] = [];

interface Props {
  patientId: string;
  headers: NutritionCycleHeader[];
  selectedId?: string;
  today: string | null;
  timezone: string | null;
}
type DayState =
  "complete" | "partial" | "no_data" | "interruption" | "future" | "unplanned";
const stateLabels: Record<DayState, string> = {
  complete: "Completo",
  partial: "Parcial",
  no_data: "Sin datos",
  interruption: "Sin registro · interrupción",
  future: "Día futuro",
  unplanned: "Con registros · sin menú",
};

/** Cobertura de comidas, no evaluación calórica ni adherencia clínica calculada en el navegador. */
function dayState(
  day: IntakeDay | undefined,
  date: string,
  today: string,
): DayState {
  if (date > today) return "future";
  if (!day?.records.length) return date < today ? "interruption" : "no_data";
  if (!day.menu?.meals.length) return "unplanned";
  return day.menu.meals.every((meal) =>
    day.records.some((row) => row.mealCode === meal.mealCode),
  )
    ? "complete"
    : "partial";
}

export function NutritionIntake(props: Props) {
  const t = useT();
  const { can } = useAppContext();
  if (!can("Nutrition.RecordsView"))
    return (
      <p className="nutrition-intake-notice">
        {t("No tienes permiso para consultar los registros de comidas.")}
      </p>
    );
  if (!props.today || !props.timezone)
    return (
      <p className="nutrition-intake-notice">
        {t(
          "Falta la zona horaria del paciente para consultar sus días de registro.",
        )}
      </p>
    );
  const periods = groupNutritionCycles(props.headers).flatMap((group) => {
    const published = group.versions.find(
      (row) => row.isPublished && row.startDate && row.endDate,
    );
    return published ? [{ group, published }] : [];
  });
  const period =
    periods.find((row) =>
      row.group.versions.some((version) => version.id === props.selectedId),
    ) ??
    [...periods]
      .filter((row) => row.published.startDate! <= props.today!)
      .sort((a, b) =>
        b.published.startDate!.localeCompare(a.published.startDate!),
      )[0];
  const start = period?.published.startDate ?? addIntakeDays(props.today, -29);
  const end = period?.published.endDate ?? props.today;
  if ((intakeDate(end) - intakeDate(start)) / 86_400_000 !== 29)
    return (
      <p role="alert" className="nutrition-intake-notice">
        {t("El ciclo no tiene un período válido de 30 días. Recarga la ficha.")}
      </p>
    );
  const nextStart = periods
    .map((row) => row.published.startDate!)
    .filter((date) => date > start)
    .sort()[0];
  const through =
    nextStart && nextStart <= props.today
      ? addIntakeDays(nextStart, -1)
      : props.today;
  return (
    <IntakeReader
      key={`${props.patientId}:${start}:${end}:${through}`}
      patientId={props.patientId}
      start={start}
      end={end}
      through={through}
      today={props.today}
      timezone={props.timezone}
      hasCycle={!!period}
      canPhotos={can("Nutrition.PhotosView")}
    />
  );
}

function IntakeReader({
  patientId,
  start,
  end,
  through,
  today,
  timezone,
  hasCycle,
  canPhotos,
}: {
  patientId: string;
  start: string;
  end: string;
  through: string;
  today: string;
  timezone: string;
  hasCycle: boolean;
  canPhotos: boolean;
}) {
  const t = useT();
  const date = useNutritionDate();
  const [continuityEnd, setContinuityEnd] = useState(through);
  const continuityStart =
    end < continuityEnd
      ? [addIntakeDays(end, 1), addIntakeDays(continuityEnd, -29)]
          .sort()
          .at(-1)!
      : null;
  const [selected, setSelected] = useState(
    today >= start && today <= end ? today : end < today ? end : start,
  );
  const load = useCallback(
    async (signal: AbortSignal) => {
      const cycle = fetchNutritionIntake(
        patientId,
        start,
        end,
        today,
        timezone,
        signal,
      );
      const continuity = continuityStart
        ? fetchNutritionIntake(
            patientId,
            continuityStart,
            continuityEnd,
            today,
            timezone,
            signal,
          )
        : null;
      const results = await Promise.all([cycle, continuity]);
      return results.flatMap((page) => page?.days ?? []);
    },
    [patientId, start, end, today, timezone, continuityStart, continuityEnd],
  );
  const { data, error, loading, retry } = useNutritionResource(load, "", true);
  const reviews = useIntakeReviews(data ?? noIntakeDays);
  const highlights = useIntakeHighlights(data ?? noIntakeDays);
  const reviewByDate = new Map(
    reviews.data?.map((row) => [row.localDate, row]),
  );
  const reviewsReady =
    reviews.data !== undefined &&
    !reviews.loading &&
    !reviews.error &&
    !!data?.some((day) => day.cycleId);
  const [filters, setFilters] = useState<IntakeFilters>(emptyIntakeFilters);
  const matchingDays = (data ?? [])
    .filter(
      (day) =>
        filterIntakeRecords(day, filters, reviewByDate.get(day.localDate))
          .length,
    )
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  const filteredCount =
    filters.unreviewed && !reviewsReady
      ? null
      : matchingDays.reduce(
          (total, day) =>
            total +
            filterIntakeRecords(day, filters, reviewByDate.get(day.localDate))
              .length,
          0,
        );
  function changeFilters(value: IntakeFilters) {
    setFilters(value);
    const next = [...(data ?? [])]
      .sort((a, b) => b.localDate.localeCompare(a.localDate))
      .find(
        (day) =>
          filterIntakeRecords(day, value, reviewByDate.get(day.localDate))
            .length,
      );
    if (next) setSelected(next.localDate);
  }
  const days = new Map(data?.map((day) => [day.localDate, day]));
  const selectedDay = days.get(selected);
  const cycleDates = intakeDates(start, end);
  const continuityDates = continuityStart
    ? intakeDates(continuityStart, continuityEnd)
    : [];
  const cycleNumber = data?.find(
    (day) => day.cycleNumber !== null,
  )?.cycleNumber;
  const denied = error && [403, 404].includes(error.status);

  function renderDay(dayDate: string) {
    const day = days.get(dayDate);
    const state = dayState(day, dayDate, today);
    const Icon =
      state === "complete"
        ? Check
        : state === "partial"
          ? CircleMinus
          : state === "interruption"
            ? CircleDashed
            : Clock3;
    const ordinal =
      Math.floor((intakeDate(dayDate) - intakeDate(start)) / 86_400_000) + 1;
    const label = t("Día {day} · {date} · {state}", {
      day: String(ordinal),
      date: date(dayDate),
      state: t(stateLabels[state]),
    });
    const review = reviewByDate.get(dayDate);
    return (
      <li key={dayDate}>
        <button
          type="button"
          className="nutrition-intake-date"
          data-state={state}
          data-today={dayDate === today || undefined}
          aria-current={dayDate === today ? "date" : undefined}
          aria-pressed={selected === dayDate}
          aria-label={`${label}${review ? ` · ${t(review.modifiedSinceReview ? "Modificado tras tu revisión" : review.unreviewed ? "Sin revisar" : review.reviewedAt ? "Revisado" : "Sin registros que revisar")}` : ""}`}
          title={label}
          onClick={() => setSelected(dayDate)}
        >
          <strong>{ordinal}</strong>
          <Icon className="size-4" aria-hidden="true" />
          <span>{dayDate.slice(8)}</span>
          {review?.reviewedAt && (
            <span aria-hidden="true">
              {review.modifiedSinceReview ? "!" : "✓"}
            </span>
          )}
        </button>
      </li>
    );
  }

  return (
    <div className="nutrition-intake" aria-label={t("Registros de comidas")}>
      <header className="nutrition-intake-header">
        <div>
          <h2>{t("Registros de comidas")}</h2>
          <p>
            {t(
              "Compara lo registrado con el menú publicado vigente en cada fecha.",
            )}
          </p>
        </div>
        <Button variant="outline" onClick={retry} disabled={loading}>
          <RefreshCw aria-hidden="true" className="size-4" />
          {t("Actualizar registros")}
        </Button>
      </header>
      {loading ? (
        <div
          role="status"
          aria-label={t("Cargando registros de comidas")}
          className="nutrition-intake-loading"
        >
          <span className="sr-only">{t("Cargando registros de comidas")}</span>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : error || !data ? (
        <div
          role="alert"
          aria-label={t("No pudimos cargar los registros de comidas")}
          className="nutrition-intake-notice"
        >
          <h3>{t("No pudimos cargar los registros de comidas")}</h3>
          <p>
            {t(
              denied
                ? "El paciente no está disponible en tu alcance o no tienes permiso para sus registros."
                : "No se pudieron consultar los registros. No se muestran días vacíos como sustituto de un error.",
            )}
          </p>
          <Button variant="outline" onClick={retry}>
            {t("Reintentar")}
          </Button>
        </div>
      ) : (
        <>
          <section
            className="nutrition-intake-strip"
            aria-label={t("Tira de días del ciclo")}
          >
            <h3>
              {hasCycle
                ? t("Tira del ciclo · 30 días y continuidad")
                : t("Últimos 30 días · sin ciclo publicado")}
            </h3>
            <p className="nutrition-intake-range">
              {cycleNumber && hasCycle
                ? `${t("Ciclo {cycle}", { cycle: String(cycleNumber) })} · `
                : ""}
              {date(start)} – {date(end)} · {timezone}
            </p>
            <ol
              className="nutrition-intake-dates"
              aria-label={t("30 días del ciclo")}
            >
              {cycleDates.map(renderDay)}
            </ol>
            {continuityStart && (
              <div className="nutrition-intake-continuity">
                <div className="nutrition-intake-continuity-header">
                  <h4>{t("En continuidad")}</h4>
                  <span>
                    {date(continuityStart)} – {date(continuityEnd)}
                  </span>
                </div>
                <p>
                  {t(
                    "Los días posteriores al día 30 pertenecen a este ciclo hasta que empieza el siguiente plan publicado.",
                  )}
                </p>
                <ol
                  className="nutrition-intake-dates"
                  aria-label={t("Días en continuidad")}
                >
                  {continuityDates.map(renderDay)}
                </ol>
                <div className="nutrition-intake-page-actions">
                  <Button
                    variant="outline"
                    disabled={continuityStart <= addIntakeDays(end, 1)}
                    onClick={() => {
                      const next = addIntakeDays(continuityStart, -1);
                      setContinuityEnd(next);
                      setSelected(next);
                    }}
                  >
                    {t("Continuidad anterior")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={continuityEnd >= through}
                    onClick={() => {
                      const next = [
                        addIntakeDays(continuityEnd, 30),
                        through,
                      ].sort()[0];
                      setContinuityEnd(next);
                      setSelected(next);
                    }}
                  >
                    {t("Continuidad siguiente")}
                  </Button>
                </div>
              </div>
            )}
            <ul
              className="nutrition-intake-legend"
              aria-label={t("Estados del registro")}
            >
              {(
                [
                  "complete",
                  "partial",
                  "no_data",
                  "interruption",
                  "future",
                  "unplanned",
                ] as const
              ).map((state) => (
                <li key={state}>
                  <span data-state={state} aria-hidden="true" />
                  {t(stateLabels[state])}
                </li>
              ))}
            </ul>
            <p className="nutrition-intake-rule">
              {t(
                "Completo y parcial indican comidas registradas respecto al menú, no cumplimiento calórico. Las interrupciones se informan aparte y no entran en la adherencia.",
              )}
            </p>
          </section>
          <NutritionIntakeFilters
            value={filters}
            onChange={changeFilters}
            canPhotos={canPhotos}
            reviewsReady={reviewsReady}
            count={filteredCount}
          />
          {hasIntakeFilters(filters) && filteredCount !== null && (
            <nav
              className="nutrition-intake-filter-results"
              aria-label={t("Días que coinciden con los filtros")}
            >
              {matchingDays.length ? (
                matchingDays.map((day) => (
                  <Button
                    key={day.localDate}
                    variant={selected === day.localDate ? "default" : "outline"}
                    aria-pressed={selected === day.localDate}
                    onClick={() => setSelected(day.localDate)}
                  >
                    {date(day.localDate)}{" "}
                    <IntakeReviewStatus
                      review={reviewByDate.get(day.localDate)}
                    />
                  </Button>
                ))
              ) : (
                <p>
                  {t(
                    "No hay registros que coincidan en los días cargados. Prueba otros filtros o cambia la ventana de continuidad.",
                  )}
                </p>
              )}
            </nav>
          )}
          <div className="nutrition-intake-selection" aria-live="polite">
            <p>
              {t("Día seleccionado: {date}", { date: date(selected) })} ·{" "}
              {t(stateLabels[dayState(selectedDay, selected, today)])}
              {selected === today && ` · ${t("Hoy, en curso")}`}
            </p>
          </div>
          {selectedDay ? (
            <NutritionIntakeDay
              key={selectedDay.localDate}
              day={selectedDay}
              canPhotos={canPhotos}
              retry={retry}
              visibleRecords={filterIntakeRecords(
                selectedDay,
                filters,
                reviewByDate.get(selectedDay.localDate),
              )}
              filterPending={filters.unreviewed && !reviewsReady}
              reviewActions={
                <NutritionIntakeReviewActions
                  day={selectedDay}
                  review={reviewByDate.get(selectedDay.localDate)}
                  loading={reviews.loading}
                  error={!!reviews.error}
                  retry={reviews.retry}
                />
              }
              isHighlighted={(record) =>
                !!highlights.data
                  ?.find((group) => group.cycleId === selectedDay.cycleId)
                  ?.items.some((item) => item.recordId === record.id)
              }
              renderRecordActions={(record) => (
                <NutritionIntakeHighlightActions
                  key={`${record.id}:${highlights.data?.find((group) => group.cycleId === selectedDay.cycleId)?.items.find((item) => item.recordId === record.id)?.recordId ?? "none"}`}
                  day={selectedDay}
                  recordId={record.id}
                  highlight={highlights.data
                    ?.find((group) => group.cycleId === selectedDay.cycleId)
                    ?.items.find((item) => item.recordId === record.id)}
                  ready={
                    highlights.data !== undefined &&
                    !highlights.loading &&
                    !highlights.error
                  }
                  port={highlights.port}
                  retry={highlights.retry}
                />
              )}
            />
          ) : (
            <p className="nutrition-intake-notice">
              {t("Este día aún no comienza; no se cuenta como interrupción.")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
