"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppContext } from "@/providers/context-provider";
import { useT } from "@/providers/i18n-provider";
import {
  useIntakeHighlights,
  NutritionIntakeHighlightActions,
} from "./nutrition-intake-highlights";
import { useIntakeReviews } from "../hooks/use-intake-reviews";
import {
  IntakeReviewStatus,
  NutritionIntakeReviewActions,
} from "./nutrition-intake-review";
import {
  IntakeMealName,
  IntakeOrigin,
  IntakePhoto,
  NutritionIntakeDay,
} from "./nutrition-intake-day";
import { isOutsideIntakeMenu, sortIntakeRecords } from "./nutrition-intake-filters";
import { useNutritionDate, useNutritionNumber } from "./nutrition-shared";
import type { IntakeDay, IntakeRecord } from "../types/nutrition-intake";

type Filter = "all" | "photo" | "outside" | "pinned";
export function NutritionCycleRecords({
  days,
  retry,
  openInbox,
  navigationLocked = false,
}: {
  days: IntakeDay[];
  retry: () => void;
  openInbox: () => void;
  navigationLocked?: boolean;
}) {
  const t = useT();
  const date = useNutritionDate();
  const number = useNutritionNumber();
  const { can } = useAppContext();
  const highlights = useIntakeHighlights(days);
  const reviews = useIntakeReviews(days);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(6);
  const [selected, setSelected] = useState<{
    date: string;
    recordId: string;
  } | null>(null);
  const canPhotos = can("Nutrition.PhotosView");
  const notesAllowed = can("Nutrition.NotesView");
  const ready =
    highlights.data !== undefined && !highlights.loading && !highlights.error;
  const getHighlight = (day: IntakeDay, recordId: string) =>
    highlights.data
      ?.find((group) => group.cycleId === day.cycleId)
      ?.items.find((item) => item.recordId === recordId);
  const rows = [...days]
    .sort((a, b) => b.localDate.localeCompare(a.localDate))
    .flatMap((day) => sortIntakeRecords(day.records).map((record) => ({ day, record })));
  const matching = rows.filter(
    ({ day, record }) =>
      filter === "all" ||
      (filter === "photo" && canPhotos && !!record.photo) ||
      (filter === "outside" && isOutsideIntakeMenu(day, record)) ||
      (filter === "pinned" && !!getHighlight(day, record.id)),
  );
  const selectedDay = days.find((day) => day.localDate === selected?.date);
  const selectedRecord = selectedDay?.records.find(
    (record) => record.id === selected?.recordId,
  );
  const reviewFor = (day: IntakeDay) =>
    reviews.data?.find((review) => review.localDate === day.localDate);
  const pins = highlights.data?.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  const unknownPins =
    highlights.data
      ?.flatMap((group) => group.items)
      .filter((item) => !rows.some((row) => row.record.id === item.recordId))
      .length ?? 0;
  function actions(day: IntakeDay, record: IntakeRecord) {
    const highlight = getHighlight(day, record.id);
    return (
      <NutritionIntakeHighlightActions
        key={`${record.id}:${highlight?.recordId ?? "none"}`}
        day={day}
        recordId={record.id}
        highlight={highlight}
        ready={ready}
        port={highlights.port}
        retry={highlights.retry}
      />
    );
  }
  return (
    <>
      <p className="nutrition-review-help">
        {t(
          "Ancla los registros que quieras comentar. Los ejemplos conservan su referencia aunque la persona corrija la comida.",
        )}
      </p>
      <div className="nutrition-review-gallery-tools">
        <div role="group" aria-label={t("Filtros de registros del cierre")}>
          {(
            [
              { key: "all", label: "Todos" },
              { key: "photo", label: "Con foto" },
              { key: "outside", label: "Fuera del plan" },
              { key: "pinned", label: "Anclados" },
            ] as const
          ).map((item) => (
            <Button
              key={item.key}
              variant={filter === item.key ? "default" : "outline"}
              aria-pressed={filter === item.key}
              disabled={
                (item.key === "photo" && !canPhotos) ||
                (item.key === "pinned" && !ready)
              }
              onClick={() => {
                setFilter(item.key);
                setLimit(6);
              }}
            >
              {t(item.label)}
            </Button>
          ))}
        </div>
        <span role="status">
          {ready
            ? t(
                pins === 1
                  ? "{count} ejemplo anclado"
                  : "{count} ejemplos anclados",
                { count: String(pins) },
              )
            : highlights.error
              ? t("Ejemplos anclados no disponibles.")
              : t("Consultando ejemplos anclados…")}
        </span>
      </div>
      {highlights.error && (
        <div
          className="nutrition-review-notice"
          role="alert"
          aria-label={t("No se pudieron cargar los ejemplos anclados")}
        >
          <p>
            {t(
              "No se pudieron cargar los ejemplos anclados. Los registros siguen disponibles.",
            )}
          </p>
          <Button variant="outline" onClick={highlights.retry}>
            {t("Actualizar ejemplos")}
          </Button>
        </div>
      )}
      {reviews.error && (
        <div className="nutrition-review-notice" role="status">
          <p>
            {t(
              "La revisión diaria aún no está disponible. Puedes seguir consultando las comidas.",
            )}
          </p>
          <Button variant="outline" onClick={reviews.retry}>
            {t("Reintentar revisión")}
          </Button>
        </div>
      )}
      {!!unknownPins && (
        <p className="nutrition-review-help">
          {t(
            unknownPins === 1
              ? "{count} ejemplo no tiene un registro disponible en esta lectura. Actualiza el período."
              : "{count} ejemplos no tienen un registro disponible en esta lectura. Actualiza el período.",
            { count: String(unknownPins) },
          )}
        </p>
      )}
      {filter === "pinned" && !ready ? (
        <p className="nutrition-review-notice">
          {t("Espera una lectura válida para filtrar ejemplos anclados.")}
        </p>
      ) : matching.length ? (
        <ul
          className="nutrition-review-gallery"
          aria-label={t("Registros del período")}
        >
          {matching.slice(0, limit).map(({ day, record }) => {
            const highlight = getHighlight(day, record.id);
            const planned = day.menu?.meals.find(
              (meal) => meal.mealCode === record.mealCode,
            );
            return (
              <li key={record.id}>
                <article
                  className="nutrition-review-record"
                  data-pinned={!!highlight || undefined}
                >
                  <IntakePhoto
                    key={`${record.id}:${record.photo?.url}:${record.photo?.expiresAt}`}
                    photo={record.photo}
                    canPhotos={canPhotos}
                    retry={retry}
                  />
                  <div>
                    <h3>
                      {date(day.localDate)} ·{" "}
                      <IntakeMealName code={record.mealCode} />
                    </h3>
                    {day.continuity && (
                      <p className="nutrition-intake-continuity-label">
                        {t("En continuidad")}
                      </p>
                    )}
                    <IntakeOrigin origin={record.origin} />
                    <p>
                      {t("Registrado: {value}", {
                        value:
                          record.mealCode === "agua"
                            ? record.waterMl === null ? t("Sin dato") : `${number(record.waterMl)} ml`
                          : record.recorded.calories === null
                            ? t("Sin dato")
                            : `${number(record.recorded.calories)} kcal`,
                      })}
                    </p>
                    {record.mealCode !== "agua" && <p>
                      {planned
                        ? t("Menú: {name} · {value}", {
                            name: planned.name || t("Sin nombre"),
                            value:
                              planned.planned.calories === null
                                ? t("Sin dato")
                                : `${number(planned.planned.calories)} kcal`,
                          })
                        : t("Sin comida planificada equivalente.")}
                    </p>}
                    {isOutsideIntakeMenu(day, record) && (
                      <p>{t("Fuera del plan · sin equivalente en el menú")}</p>
                    )}
                    {record.patientCorrection && (
                      <p>{t("La persona corrigió el análisis")}</p>
                    )}
                    <IntakeReviewStatus review={reviewFor(day)} />
                    {highlight && (
                      <p className="nutrition-intake-pinned">
                        <Star className="size-4" aria-hidden="true" />
                        {t("Ejemplo anclado")}
                      </p>
                    )}
                    {highlight?.note && notesAllowed && (
                      <p className="nutrition-review-highlight-note">
                        {highlight.note}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      onClick={() =>
                        setSelected({
                          date: day.localDate,
                          recordId: record.id,
                        })
                      }
                    >
                      {t("Ver registro y ejemplo")}
                    </Button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="nutrition-review-notice">
          {t(
            rows.length
              ? "No hay registros que coincidan con este filtro."
              : "No hay comidas ni registros para mostrar en este período.",
          )}
        </p>
      )}
      <div className="nutrition-review-gallery-footer">
        <p role="status">
          {t(
            matching.length === 1
              ? "Mostrando {shown} de {total} registro"
              : "Mostrando {shown} de {total} registros",
            {
              shown: String(Math.min(limit, matching.length)),
              total: String(matching.length),
            },
          )}
        </p>
        {matching.length > limit && (
          <Button
            variant="outline"
            onClick={() => setLimit((value) => value + 6)}
          >
            {t("Cargar más registros")}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={openInbox}
          disabled={navigationLocked}
        >
          {t("Abrir la bandeja de registros")}
        </Button>
      </div>
      <Dialog
        open={!!selectedRecord}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{t("Registro y ejemplo anclado")}</DialogTitle>
            <DialogDescription>
              {t(
                "Consulta el menú de esa fecha y la versión actual del registro antes de anclarlo.",
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedDay && selectedRecord && (
            <NutritionIntakeDay
              day={selectedDay}
              canPhotos={canPhotos}
              retry={retry}
              visibleRecords={[selectedRecord]}
              reviewActions={
                <NutritionIntakeReviewActions
                  day={selectedDay}
                  review={reviewFor(selectedDay)}
                  loading={reviews.loading}
                  error={!!reviews.error}
                  retry={reviews.retry}
                />
              }
              isHighlighted={(record) => !!getHighlight(selectedDay, record.id)}
              renderRecordActions={(record) => actions(selectedDay, record)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
