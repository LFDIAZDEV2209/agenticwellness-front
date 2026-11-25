"use client";

import { useCallback, useState } from "react";
import {
  Check,
  CircleDashed,
  CircleMinus,
  Clock3,
  RefreshCw,
  Star,
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
  onStartReview?: () => void;
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
  const food = day?.records.filter(row => row.mealCode !== "agua") ?? [];
  if (!food.length) return date < today ? "interruption" : "no_data";
  if (!day?.menu?.meals.length) return "unplanned";
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
          "Falta la zona horaria de la persona para consultar sus días de registro.",
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
      onStartReview={props.onStartReview}
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
  onStartReview,
}: {
  patientId: string;
  start: string;
  end: string;
  through: string;
  today: string;
  timezone: string;
  hasCycle: boolean;
  canPhotos: boolean;
  onStartReview?: () => void;
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
  const [chosenDate, setSelected] = useState<string | null>(null);
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
  const selected = chosenDate ?? [...(data ?? [])]
    .filter(day => day.records.length)
    .sort((a,b) => b.localDate.localeCompare(a.localDate))[0]?.localDate ??
    (today >= start && today <= end ? today : end < today ? end : start);
  const allRecords = (data ?? []).flatMap(day => day.records);
  const counts = {
    photo: canPhotos && data ? allRecords.filter(row => row.photo).length : null,
    unreviewed: reviewsReady ? (data ?? []).reduce((sum, day) =>
      sum + (reviewByDate.get(day.localDate)?.unreviewed ? day.records.length : 0), 0) : null,
    outsidePlan: (data ?? []).reduce((sum,day) => sum + filterIntakeRecords(day, {
      ...emptyIntakeFilters, outsidePlan: true,
    }).length, 0),
  };
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
    const pinned = day?.records.some(record => record.mealCode !== "agua" && highlights.data
      ?.find(group => group.cycleId === day.cycleId)?.items.some(item => item.recordId === record.id));
    const fullLabel = `${label}${dayDate === today ? ` · ${t("Hoy, en curso")}` : ""}${review ? ` · ${t(review.modifiedSinceReview ? "Modificado tras tu revisión" : review.unreviewed ? "Sin revisar" : review.reviewedAt ? "Revisado" : "Sin registros que revisar")}` : ""}${pinned ? ` · ${t("Ejemplo anclado")}` : ""}`;
    return (
      <li key={dayDate}>
        <button
          type="button"
          className="nutrition-intake-date"
          data-state={state}
          data-today={dayDate === today || undefined}
          aria-current={dayDate === today ? "date" : undefined}
          aria-pressed={selected === dayDate}
          aria-label={fullLabel}
          title={fullLabel}
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
          {pinned && <Star className="size-3" aria-hidden="true" />}
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
          {data && !error && !loading && (
            <ul className="nutrition-intake-counts" aria-label={t("Resumen de registros cargados")}>
              <li>{t("{count} registros", {count: String(allRecords.length)})}</li>
              <li>{counts.unreviewed === null ? t("Sin revisar: no disponible") : t("{count} registros sin revisar", {count: String(counts.unreviewed)})}</li>
              {canPhotos && <li>{t("{count} con foto", {count: String(counts.photo)})}</li>}
            </ul>
          )}
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
                ? "La persona está fuera de tu alcance o no tienes permiso para consultar sus registros."
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
            {hasCycle && onStartReview && (
              <Button variant="outline" onClick={onStartReview}>
                {t("Iniciar revisión del ciclo")}
              </Button>
            )}
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
              <li><Check className="size-4" aria-hidden="true" />{t("Revisado")}</li>
              <li><span aria-hidden="true">!</span>{t("Modificado tras tu revisión")}</li>
              <li><Star className="size-4" aria-hidden="true" />{t("Ejemplo anclado")}</li>
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
            counts={counts}
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
