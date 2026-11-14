"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Expand, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/providers/i18n-provider";
import type {
  IntakeDay,
  IntakeMacros,
  IntakeRecord,
} from "../types/nutrition-intake";
import { useNutritionDate, useNutritionNumber } from "./nutrition-shared";

export function IntakeMealName({ code }: { code: string }) {
  const t = useT();
  const labels: Record<string, string> = {
    des: "Desayuno",
    alm: "Almuerzo",
    mer: "Merienda",
    cen: "Cena",
    agua: "Agua",
  };
  return <>{labels[code] ? t(labels[code]) : code}</>;
}
function Origin({ origin }: { origin: IntakeRecord["origin"] }) {
  const t = useT();
  return (
    <span
      className={`nutrition-intake-origin nutrition-intake-origin-${origin}`}
    >
      {t(
        origin === "ai_estimated"
          ? "Estimado por IA"
          : origin === "patient_confirmed"
            ? "Confirmado por el paciente"
            : "Clínico",
      )}
    </span>
  );
}
function Macros({ value }: { value: IntakeMacros }) {
  const t = useT();
  const number = useNutritionNumber();
  return (
    <dl className="nutrition-intake-macros">
      {(
        [
          ["Energía", value.calories, "kcal"],
          ["Proteínas", value.proteinG, "g"],
          ["Carbohidratos", value.carbsG, "g"],
          ["Grasas", value.fatG, "g"],
          ["Fibra", value.fiberG, "g"],
        ] as const
      ).map(([label, amount, unit]) => (
        <div key={label}>
          <dt>{t(label)}</dt>
          <dd>
            {amount === null ? t("Sin dato") : `${number(amount)} ${unit}`}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function IntakePhoto({
  photo,
  canPhotos,
  retry,
}: {
  photo: IntakeRecord["photo"];
  canPhotos: boolean;
  retry: () => void;
}) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(
    () => !!photo && Date.parse(photo.expiresAt) <= Date.now(),
  );
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!photo || !canPhotos) return;
    const remaining = Date.parse(photo.expiresAt) - Date.now();
    const timer = window.setTimeout(
      () => setExpired(true),
      Math.max(0, Math.min(remaining, 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [photo, canPhotos]);
  if (!canPhotos || !photo)
    return (
      <p className="nutrition-intake-no-photo">
        <ImageOff aria-hidden="true" className="size-5" />
        {t(canPhotos ? "Sin foto" : "Fotos restringidas por permisos")}
      </p>
    );
  if (expired || failed)
    return (
      <div className="nutrition-intake-photo-error" role="status">
        <ImageOff aria-hidden="true" />
        <p>{t("La foto caducó o no está disponible.")}</p>
        <Button variant="outline" onClick={retry}>
          {t("Actualizar foto")}
        </Button>
      </div>
    );
  return (
    <>
      <button
        type="button"
        className="nutrition-intake-photo"
        onClick={() => {
          if (Date.parse(photo.expiresAt) > Date.now()) setOpen(true);
          else setExpired(true);
        }}
        aria-label={t("Ampliar foto de la comida")}
      >
        <Image
          src={photo.url}
          alt={t("Foto de la comida registrada")}
          width={640}
          height={480}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
        <span>
          <Expand aria-hidden="true" className="size-4" />
          {t("Ampliar foto")}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{t("Foto de la comida")}</DialogTitle>
            <DialogDescription>
              {t("Enlace temporal autorizado para este paciente.")}
            </DialogDescription>
          </DialogHeader>
          <Image
            src={photo.url}
            alt={t("Foto ampliada de la comida registrada")}
            width={1200}
            height={900}
            unoptimized
            referrerPolicy="no-referrer"
            className="max-h-[65dvh] w-full object-contain"
            onError={() => setFailed(true)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NutritionIntakeDay({
  day,
  canPhotos,
  retry,
}: {
  day: IntakeDay;
  canPhotos: boolean;
  retry: () => void;
}) {
  const t = useT();
  const date = useNutritionDate();
  const number = useNutritionNumber();
  const [selected, setSelected] = useState<string | null>(null);
  const current =
    day.records.find((row) => row.id === selected) ?? day.records[0];
  const planned = current
    ? day.menu?.meals.find((meal) => meal.mealCode === current.mealCode)
    : null;
  return (
    <section className="nutrition-intake-day" aria-label={t("Detalle del día")}>
      <header className="nutrition-intake-day-header">
        <h3>{date(day.localDate)}</h3>
        {day.continuity && (
          <span className="nutrition-intake-continuity-label">
            {t("En continuidad")}
          </span>
        )}
        <p>
          {day.menu
            ? t("Menú vigente en esta fecha · versión {version} · día {day}", {
                version: String(day.menu.version),
                day: String(day.menu.dayNumber),
              })
            : t("Sin menú publicado para esta fecha.")}
        </p>
      </header>
      <div className="nutrition-intake-detail-grid">
        <div>
          <h4 className="nutrition-intake-heading">
            {t("Comidas registradas y menú vigente")}
          </h4>
          {!day.records.length && (
            <p className="nutrition-intake-empty">
              {t("No hay comidas registradas en este día.")}
            </p>
          )}
          <ul className="nutrition-intake-meals">
            {day.records.map((row) => {
              const menu = day.menu?.meals.find(
                (meal) => meal.mealCode === row.mealCode,
              );
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-pressed={current?.id === row.id}
                    onClick={() => setSelected(row.id)}
                    className="nutrition-intake-meal"
                  >
                    <span className="nutrition-intake-meal-title">
                      <strong>
                        <IntakeMealName code={row.mealCode} />
                      </strong>
                      <Origin origin={row.origin} />
                    </span>
                    <span>
                      {t("Registrado: {value}", {
                        value:
                          row.recorded.calories === null
                            ? t("Sin dato")
                            : `${number(row.recorded.calories)} kcal`,
                      })}
                    </span>
                    <span className="text-muted-foreground">
                      {menu
                        ? t("Menú: {name} · {value}", {
                            name: menu.name || t("Sin nombre"),
                            value:
                              menu.planned.calories === null
                                ? t("Sin dato")
                                : `${number(menu.planned.calories)} kcal`,
                          })
                        : t("Sin comida planificada equivalente.")}
                    </span>
                    {row.patientCorrection && (
                      <span className="nutrition-intake-correction">
                        {t("El paciente corrigió el análisis")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {!!day.menu?.meals.length && (
            <div className="nutrition-intake-missing">
              <h4>{t("Comidas planificadas sin registro")}</h4>
              <ul>
                {day.menu.meals
                  .filter(
                    (meal) =>
                      !day.records.some(
                        (row) => row.mealCode === meal.mealCode,
                      ),
                  )
                  .map((meal) => (
                    <li key={meal.mealCode}>
                      <IntakeMealName code={meal.mealCode} />
                      {meal.name && ` · ${meal.name}`}
                    </li>
                  ))}
              </ul>
              {day.menu.meals.every((meal) =>
                day.records.some((row) => row.mealCode === meal.mealCode),
              ) && <p>{t("Todas las comidas del menú tienen registro.")}</p>}
            </div>
          )}
        </div>
        {current && (
          <aside
            key={current.id}
            className="nutrition-intake-record"
            aria-label={t("Detalle de la comida")}
          >
            <h4 className="nutrition-intake-heading">
              <IntakeMealName code={current.mealCode} />
            </h4>
            <IntakePhoto
              key={`${current.photo?.url}:${current.photo?.expiresAt}`}
              photo={current.photo}
              canPhotos={canPhotos}
              retry={retry}
            />
            <Origin origin={current.origin} />
            <h5>{t("Registro final")}</h5>
            <Macros value={current.recorded} />
            {current.waterMl !== null && (
              <p>{t("Agua: {value} ml", { value: number(current.waterMl) })}</p>
            )}
            {planned && (
              <div className="nutrition-intake-analysis">
                <h5>{t("Menú vigente en esta fecha")}</h5>
                <p>{planned.name || t("Sin nombre")}</p>
                <Macros value={planned.planned} />
              </div>
            )}
            {current.analysis ? (
              <section
                className="nutrition-intake-analysis"
                aria-label={t("Análisis de la foto")}
              >
                <h5>{t("Estimación original por IA")}</h5>
                <Macros value={current.analysis.estimated} />
                {current.patientCorrection && (
                  <p className="nutrition-intake-correction">
                    {t(
                      "El registro final incluye la corrección del paciente; la estimación original se conserva aparte.",
                    )}
                  </p>
                )}
                <ul>
                  {current.analysis.items.map((item, index) => (
                    <li key={index}>
                      <strong>{item.name}</strong>
                      {item.portionSize && <p>{item.portionSize}</p>}
                      {item.estimatedGrams !== null && (
                        <p>
                          {t("Porción estimada: {value} g", {
                            value: number(item.estimatedGrams),
                          })}
                        </p>
                      )}
                      <Macros value={item.estimated} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("Este registro no tiene análisis de foto.")}
              </p>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
