"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/providers/i18n-provider";
import type { MotorPlanDay, MotorPlanOverview } from "../services/motor-plan-service";

const goals = { bajar: "Pérdida de peso", masa: "Ganancia muscular", def: "Definición" } as const;

export function MotorPlanOverviewSections({ plan, overview, onOpenCalendar }: {
  plan: MotorPlanDay;
  overview: MotorPlanOverview;
  onOpenCalendar: () => void;
}) {
  const { t, lang } = useI18n();
  const title = useId();
  const number = new Intl.NumberFormat(lang);
  const weight = new Intl.NumberFormat(lang, { style: "unit", unit: "kilogram" });

  return (
    <div className="mt-4 space-y-4 border-t pt-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <p className="font-medium">{t("Objetivo: {goal}", { goal: t(goals[overview.goal]) })}</p>
        {overview.targetWeightKg != null && (
          <p className="text-muted-foreground">{t("Peso objetivo: {weight}", { weight: weight.format(overview.targetWeightKg) })}</p>
        )}
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <MotorTodayExercise exercise={plan.exercise} />
        <MotorTodayMenu mealPlan={plan.mealPlan} />
      </div>
      <MotorWeek week={overview.week} today={plan.today} />
      <MotorFollowUp plan={plan} progress={overview.progress} onOpenCalendar={onOpenCalendar} />
      {((plan.why?.length ?? 0) > 0 || overview.recentEvents.length > 0) && (
        <section aria-labelledby={title} className="space-y-2 border-t pt-3">
          <h3 id={title} className="font-semibold">{t("Motivos y eventos del Motor 365")}</h3>
          {plan.why && plan.why.length > 0 && (
            <ul className="list-disc space-y-1 ps-5 text-muted-foreground" role="list">
              {plan.why.map((reason, index) => <li key={index}>{reason[lang]}</li>)}
            </ul>
          )}
          {overview.recentEvents.length > 0 && (
            <ul className="divide-y" role="list">
              {overview.recentEvents.map((event, index) => <li key={`${event.d}:${event.k}:${index}`} className="py-2">
                <span className="font-medium">{t("Día {day}", { day: number.format(event.d) })}</span>
                <p className="text-muted-foreground">{event[lang]}</p>
              </li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function MotorTodayExercise({ exercise }: { exercise: MotorPlanDay["exercise"] }) {
  const { t, lang } = useI18n();
  const title = useId();
  const number = new Intl.NumberFormat(lang);
  return (
    <section aria-labelledby={title} className="min-w-0 space-y-2 rounded-lg border p-3">
      <h3 id={title} className="font-semibold">{t("Ejercicio de hoy")}</h3>
      {!exercise ? <p className="text-muted-foreground">{t("No hay ejercicio programado para hoy.")}</p> : (
        <>
          <p className="font-medium">{exercise.name[lang]}</p>
          <p className="flex flex-wrap gap-x-2 text-muted-foreground">
            <span>{exercise.phase.name[lang]}</span>
            {exercise.minutes > 0 && <span>{t("{minutes} min", { minutes: number.format(exercise.minutes) })}</span>}
            {exercise.deload && <span>{t("Descarga")}</span>}
          </p>
          {exercise.items.length > 0 && <ul className="divide-y" role="list">
            {exercise.items.map(item => (
              <li key={item.id} className="flex flex-wrap justify-between gap-x-2 py-1">
                <span>{item.guide[lang].n}</span>
                <span className="text-muted-foreground">
                  {item.strength?.holdSeconds
                    ? t("{sets} series · {seconds} s", { sets: number.format(item.strength.sets), seconds: number.format(item.strength.holdSeconds) })
                    : item.strength
                      ? t("{sets} series · {reps} repeticiones", { sets: number.format(item.strength.sets), reps: number.format(item.strength.reps) })
                      : t("{minutes} min", { minutes: number.format(item.minutes) })}
                </span>
              </li>
            ))}
          </ul>}
        </>
      )}
    </section>
  );
}

function MotorTodayMenu({ mealPlan }: { mealPlan: MotorPlanDay["mealPlan"] }) {
  const { t, lang } = useI18n();
  const title = useId();
  const grams = new Intl.NumberFormat(lang, { style: "unit", unit: "gram", maximumFractionDigits: 1 });
  return (
    <section aria-labelledby={title} className="min-w-0 space-y-2 rounded-lg border p-3">
      <h3 id={title} className="font-semibold">{t("Menú de hoy")}</h3>
      {!mealPlan?.meals.length ? <p className="text-muted-foreground">{t("No hay menú disponible.")}</p> : (
        <>
          <p className="text-muted-foreground">{t("Menú base del plan. No representa lo que consumió la persona.")}</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {mealPlan.meals.map(meal => (
              <div key={meal.id}>
                <dt className="font-medium">{meal.name[lang]}</dt>
                <dd className="text-muted-foreground">
                  <ul className="mt-1" role="list">
                    {meal.options[0]?.items.map(({ food, name, grams: portion }, index) =>
                      <li key={`${food}:${index}`}>{name[lang]} · {grams.format(portion)}</li>)}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

function MotorWeek({ week, today }: { week: MotorPlanOverview["week"]; today: number }) {
  const { t, lang } = useI18n();
  const title = useId();
  const number = new Intl.NumberFormat(lang);
  return (
    <section aria-labelledby={title} className="space-y-2">
      <h3 id={title} className="font-semibold">{t("Plan semanal del Motor 365")}</h3>
      <ul className="grid min-w-0 gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7" role="list">
        {week.map(day => (
          <li key={day.day} aria-current={day.day === today ? "date" : undefined}
            className={`min-w-0 space-y-1 rounded-lg border px-2 py-2 break-words ${day.day === today ? "border-primary" : ""}`}>
            <p className="font-medium">{t("Día {day}", { day: number.format(day.day) })}
              {day.day === today && <span className="text-muted-foreground"> · {t("Hoy")}</span>}</p>
            <p>{day.paused ? t("Plan en pausa") : day.exercise?.[lang]}</p>
            {day.minutes > 0 && <p className="text-muted-foreground">{t("{minutes} min", { minutes: number.format(day.minutes) })}</p>}
            {day.future ? <p className="text-muted-foreground">{t("Programado")}</p> :
              day.completedExercise === true ? <p>{t("Ejercicio registrado")}</p> :
                <p className="text-muted-foreground">{t(day.completedExercise === false
                  ? "Sin ejercicio completado" : "Sin registro")}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MotorFollowUp({ plan, progress, onOpenCalendar }: {
  plan: MotorPlanDay;
  progress: MotorPlanOverview["progress"];
  onOpenCalendar: () => void;
}) {
  const { t, lang } = useI18n();
  const title = useId();
  const number = new Intl.NumberFormat(lang);
  const percent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 });
  const weight = new Intl.NumberFormat(lang, { style: "unit", unit: "kilogram", maximumFractionDigits: 2 });
  const waist = new Intl.NumberFormat(lang, { style: "unit", unit: "centimeter", maximumFractionDigits: 2 });
  return (
    <section aria-labelledby={title} className="space-y-3 rounded-lg border p-3">
      <h3 id={title} className="font-semibold">{t("Seguimiento del Motor 365")}</h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        <div>
          <dt>{t("Adherencia de hoy")}</dt>
          <dd className="font-medium tabular-nums">{plan.logStatus === "recorded" && plan.adherence != null ? percent.format(plan.adherence) : t("Sin registro")}</dd>
        </div>
        <div>
          <dt>{t("Ejercicio de hoy")}</dt>
          <dd className="font-medium">{t(progress.completedExercise === true ? "Ejercicio registrado" :
            progress.completedExercise === false ? "Sin ejercicio completado" : "Sin registro")}</dd>
        </div>
        <div>
          <dt>{t("Racha")}</dt>
          <dd className="font-medium tabular-nums">{t("{days} días", { days: number.format(plan.streak ?? 0) })}</dd>
        </div>
        <div>
          <dt>{t("Último peso registrado")}</dt>
          <dd className="font-medium tabular-nums">{progress.weightKg ? <>
            <span>{weight.format(progress.weightKg.value)}</span>
            <span className="font-normal text-muted-foreground"> · {t("Día {day}", { day: number.format(progress.weightKg.day) })}</span>
          </> : t("Sin pesaje")}</dd>
        </div>
        <div>
          <dt>{t("Última cintura registrada")}</dt>
          <dd className="font-medium tabular-nums">{progress.waistCm ? <>
            <span>{waist.format(progress.waistCm.value)}</span>
            <span className="font-normal text-muted-foreground"> · {t("Día {day}", { day: number.format(progress.waistCm.day) })}</span>
          </> : t("Sin registro")}</dd>
        </div>
        <div>
          <dt>{t("Año 365")}</dt>
          <dd className="font-medium tabular-nums">{t("{recorded} de {elapsed} días registrados", {
            recorded: number.format(progress.recordedDays), elapsed: number.format(plan.today),
          })}</dd>
        </div>
      </dl>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onOpenCalendar}>
        {t("Abrir calendario de 365 días")}
      </Button>
    </section>
  );
}
