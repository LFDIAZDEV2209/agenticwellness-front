"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/providers/i18n-provider";
import type { IntakeDay, IntakeRecord } from "../types/nutrition-intake";
import type { IntakeDayReview } from "../services/nutrition-intake-review-service";

export interface IntakeFilters {
  photo: boolean;
  unreviewed: boolean;
  outsidePlan: boolean;
  mealCode: string;
}
export const emptyIntakeFilters: IntakeFilters = {
  photo: false,
  unreviewed: false,
  outsidePlan: false,
  mealCode: "all",
};
export const hasIntakeFilters = (filters: IntakeFilters) =>
  filters.photo ||
  filters.unreviewed ||
  filters.outsidePlan ||
  filters.mealCode !== "all";
/** Decisión de Luis: mismo mealCode, sin umbral calórico ni clasificación clínica. */
export function isOutsideIntakeMenu(day: IntakeDay, record: IntakeRecord) {
  return record.mealCode !== "agua" &&
    !day.menu?.meals.some((meal) => meal.mealCode === record.mealCode);
}
/** Orden clínico de presentación; el DTO 3.7 no incluye hora del registro. */
export function sortIntakeRecords(records: IntakeRecord[]) {
  const order = ["des", "alm", "mer", "cen", "agua"];
  const rank = (code: string) => {
    const index = order.indexOf(code);
    return index < 0 ? order.length : index;
  };
  return [...records].sort((a, b) => rank(a.mealCode) - rank(b.mealCode));
}
export function filterIntakeRecords(
  day: IntakeDay,
  filters: IntakeFilters,
  review?: IntakeDayReview,
) {
  return day.records.filter(
    (row) =>
      (!filters.photo || !!row.photo) &&
      (!filters.unreviewed || review?.unreviewed === true) &&
      (!filters.outsidePlan || isOutsideIntakeMenu(day, row)) &&
      (filters.mealCode === "all" || row.mealCode === filters.mealCode),
  );
}

export function NutritionIntakeFilters({
  value,
  onChange,
  canPhotos,
  reviewsReady,
  count,
  counts,
}: {
  value: IntakeFilters;
  onChange: (value: IntakeFilters) => void;
  canPhotos: boolean;
  reviewsReady: boolean;
  count: number | null;
  counts: { photo: number | null; unreviewed: number | null; outsidePlan: number };
}) {
  const t = useT();
  const id = useId();
  return (
    <search
      className="nutrition-intake-filters"
      aria-label={t("Filtros de comidas registradas")}
    >
      <fieldset>
        <legend>{t("Filtrar registros")}</legend>
        <div className="nutrition-intake-filter-controls">
          {(
            [
              { key: "photo", label: "Con foto", enabled: canPhotos },
              {
                key: "unreviewed",
                label: "Sin revisar",
                enabled: reviewsReady,
              },
              { key: "outsidePlan", label: "Fuera del plan", enabled: true },
            ] as const
          ).map((item) => (
            <label
              key={item.key}
                className="nutrition-intake-filter-toggle"
              title={
                !item.enabled
                  ? t(
                      item.key === "photo"
                        ? "Fotos restringidas por permisos"
                        : "Revisión no disponible",
                    )
                  : undefined
              }
            >
              <input
                type="checkbox"
                className="nutrition-intake-chip-input"
                aria-label={t(item.label)}
                name={item.key}
                checked={value[item.key]}
                disabled={!item.enabled}
                onChange={(event) =>
                  onChange({ ...value, [item.key]: event.target.checked })
                }
              />
              <span>{t(item.label)}</span>
              <span aria-hidden="true" className="nutrition-intake-filter-count">
                {counts[item.key] ?? "—"}
              </span>
            </label>
          ))}
          <div className="nutrition-intake-meal-filter">
            <label htmlFor={id}>{t("Tipo de comida")}</label>
            <select
              id={id}
              name="mealCode"
              value={value.mealCode}
              onChange={(event) =>
                onChange({ ...value, mealCode: event.target.value })
              }
            >
              {[
                ["all", "Todas"],
                ["des", "Desayuno"],
                ["alm", "Almuerzo"],
                ["mer", "Merienda"],
                ["cen", "Cena"],
                ["agua", "Agua"],
              ].map(([code, label]) => (
                <option key={code} value={code}>
                  {t(label)}
                </option>
              ))}
            </select>
          </div>
          {hasIntakeFilters(value) && (
            <Button
              variant="ghost"
              onClick={() => onChange(emptyIntakeFilters)}
            >
              {t("Limpiar filtros")}
            </Button>
          )}
        </div>
      </fieldset>
      <p>
        {t(
          "Fuera del plan: comida sin equivalente en el menú de ese día. El agua se muestra aparte y el desvío calórico no filtra.",
        )}
      </p>
      <p role="status">
        {count === null
          ? t("El filtro sin revisar está pendiente de una lectura válida.")
          : t("{count} registros en los días cargados", { count: String(count) })}
      </p>
      <p>
        {t(
          "Los filtros se aplican al ciclo y a la ventana de continuidad cargada.",
        )}
      </p>
    </search>
  );
}
