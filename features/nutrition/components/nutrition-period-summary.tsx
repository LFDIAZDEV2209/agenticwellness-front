"use client";

import { useT } from "@/providers/i18n-provider";
import { useNutritionNumber, useNutritionDate } from "./nutrition-shared";
import { periodAverage } from "../lib/nutrition-period-summary";
import type {
  NutritionPeriodRead,
  PeriodMetric,
} from "../types/nutrition-cycle-review";
import type { IntakeRecord } from "../types/nutrition-intake";

const metrics: { key: PeriodMetric; label: string; unit: string }[] = [
  { key: "calories", label: "Calorías promedio", unit: "kcal" },
  { key: "proteinG", label: "Proteína promedio", unit: "g" },
  { key: "carbsG", label: "Carbohidratos promedio", unit: "g" },
  { key: "fatG", label: "Grasas promedio", unit: "g" },
  { key: "fiberG", label: "Fibra promedio", unit: "g" },
  { key: "waterMl", label: "Agua registrada promedio", unit: "ml" },
];

export function NutritionPeriodSummary({
  period,
}: {
  period: NutritionPeriodRead;
}) {
  const t = useT();
  const number = useNutritionNumber();
  const { adherence: a, days } = period;
  const origins = ["ai_estimated", "patient_confirmed"] as const;
  return (
    <>
      <div className="nutrition-review-stats">
        <div>
          <h3>{t("Días con registros")}</h3>
          <strong>
            {t("{actual} de {total}", {
              actual: number(a.daysWithData, 0),
              total: number(a.elapsedDays, 0),
            })}
          </strong>
          <p>
            {t(
              a.interruptions === 1
                ? "{count} día de interrupción, fuera del denominador de adherencia."
                : "{count} días de interrupción, fuera del denominador de adherencia.",
              { count: number(a.interruptions, 0) },
            )}
          </p>
        </div>
        <div>
          <h3>{t("Adherencia del ciclo")}</h3>
          <strong>
            {a.adherence === null
              ? t("Sin dato")
              : `${number(a.adherence * 100)} %`}
          </strong>
          <p>
            {t(
              "Promedio de los días con comidas; excluye días futuros y sin registros.",
            )}
          </p>
          {a.daysWithUnknownMenu > 0 && (
            <p>
              {t(
                a.daysWithUnknownMenu === 1
                  ? "{count} día con menú desconocido."
                  : "{count} días con menú desconocido.",
                {
                  count: number(a.daysWithUnknownMenu, 0),
                },
              )}
            </p>
          )}
        </div>
        {(["calories", "waterMl"] as const).map((metric) => {
          const average = periodAverage(days, metric);
          return (
            <div key={metric}>
              <h3>
                {t(
                  metric === "calories"
                    ? "Calorías promedio"
                    : "Agua registrada promedio",
                )}
              </h3>
              <strong>
                {average.value === null
                  ? t("Sin dato")
                  : `${number(average.value)} ${metric === "calories" ? "kcal" : "ml"}`}
              </strong>
              <p>
                {t(
                  average.days === 1
                    ? "{count} día con valor conocido"
                    : "{count} días con valor conocido",
                  {
                    count: number(average.days, 0),
                  },
                )}
              </p>
            </div>
          );
        })}
      </div>
      {!a.daysWithData && (
        <p className="nutrition-review-notice">
          {t(
            "No hay comidas registradas en este período. La adherencia no se sustituye por cero.",
          )}
        </p>
      )}
      <h3 className="nutrition-review-subheading">
        {t("Medias diarias y menú histórico")}
      </h3>
      <p className="nutrition-review-help">
        {t(
          "Media conjunta de registros estimados por IA y confirmados por la persona. Se desglosan por origen más abajo.",
        )}
      </p>
      <dl className="nutrition-review-average-list">
        {metrics.map((metric) => {
          const average = periodAverage(days, metric.key);
          return (
            <div key={metric.key}>
              <dt>{t(metric.label)}</dt>
              <dd>
                <strong>
                  {average.value === null
                    ? t("Sin dato")
                    : `${number(average.value)} ${metric.unit}`}
                </strong>
                <span>
                  {t(
                    average.days === 1
                      ? "{count} día con valor conocido"
                      : "{count} días con valor conocido",
                    {
                      count: number(average.days, 0),
                    },
                  )}
                </span>
                <span>
                  {average.planned === null
                    ? t(
                        metric.key === "waterMl"
                          ? "Meta histórica de agua no disponible."
                          : "Meta histórica no disponible.",
                      )
                    : t(
                        average.plannedDays === 1
                          ? "Menú: {value} {unit} · {count} día"
                          : "Menú: {value} {unit} · {count} días",
                        {
                          value: number(average.planned),
                          unit: metric.unit,
                          count: number(average.plannedDays, 0),
                        },
                      )}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <h3 className="nutrition-review-subheading">
        {t("Origen de los registros")}
      </h3>
      <div className="nutrition-review-origins">
        {origins.map((origin) => {
          const records = days
            .flatMap((day) => day.records)
            .filter((row) => row.mealCode !== "agua" && row.origin === origin);
          const average = periodAverage(days, "calories", origin);
          return (
            <div key={origin}>
              <strong>
                {t(
                  origin === "ai_estimated"
                    ? "Estimado por IA"
                    : "Confirmado por el paciente",
                )}
              </strong>
              <p>
                {t(
                  records.length === 1
                    ? "{count} comida registrada"
                    : "{count} comidas registradas",
                  {
                    count: number(records.length, 0),
                  },
                )}
              </p>
              <p>
                {t("Calorías promedio")}:{" "}
                {average.value === null
                  ? t("Sin dato")
                  : `${number(average.value)} kcal`}
              </p>
              <p>
                {t(
                  average.days === 1
                    ? "{count} día con valor conocido"
                    : "{count} días con valor conocido",
                  {
                    count: number(average.days, 0),
                  },
                )}
              </p>
            </div>
          );
        })}
      </div>
      <p className="nutrition-review-help">
        {t(
          "Las medias suman lo registrado en cada día y usan solo días con valores conocidos. Un registro parcial no equivale a incumplimiento del plan. Los valores ausentes no se rellenan con cero.",
        )}
      </p>
    </>
  );
}

export function NutritionPeriodComparison({
  current,
  previous,
}: {
  current: NutritionPeriodRead;
  previous: NutritionPeriodRead;
}) {
  const t = useT();
  const number = useNutritionNumber();
  const date = useNutritionDate();
  const columns = [t("Ciclo anterior"), t("Ciclo revisado"), t("Diferencia")];
  const format = (n: number | null, unit: string) =>
    n === null ? t("Sin dato") : `${number(n)} ${unit}`;
  const rows: {
    key: string;
    label: string;
    unit: string;
    before: number | null;
    now: number | null;
    coverage?: string;
  }[] = [
    {
      key: "coverage",
      label: "Días con registros",
      unit: t("días"),
      before: previous.adherence.daysWithData,
      now: current.adherence.daysWithData,
    },
    {
      key: "adherence",
      label: "Adherencia del ciclo",
      unit: "%",
      before:
        previous.adherence.adherence === null
          ? null
          : previous.adherence.adherence * 100,
      now:
        current.adherence.adherence === null
          ? null
          : current.adherence.adherence * 100,
    },
    ...metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      before: periodAverage(previous.days, metric.key).value,
      now: periodAverage(current.days, metric.key).value,
      coverage: t("Días con valor: anterior {before} · revisado {now}", {
        before: String(periodAverage(previous.days, metric.key).days),
        now: String(periodAverage(current.days, metric.key).days),
      }),
    })),
  ];
  const sourceRows = (origin: IntakeRecord["origin"]) =>
    metrics
      .filter((metric) => metric.key !== "waterMl")
      .map((metric) => ({
        key: `${origin}-${metric.key}`,
        label: metric.label,
        unit: metric.unit,
        before: periodAverage(previous.days, metric.key, origin).value,
        now: periodAverage(current.days, metric.key, origin).value,
        coverage: t("Días con valor: anterior {before} · revisado {now}", {
          before: String(periodAverage(previous.days, metric.key, origin).days),
          now: String(periodAverage(current.days, metric.key, origin).days),
        }),
      }));
  function table(title: string, values: typeof rows) {
    return (
      <div className="nutrition-review-table-wrap">
        <table className="nutrition-review-comparison">
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Cifra")}</th>
              {columns.map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  {t(row.label)}
                  {row.coverage && <span>{row.coverage}</span>}
                </th>
                <td data-label={columns[0]}>{format(row.before, row.unit)}</td>
                <td data-label={columns[1]}>{format(row.now, row.unit)}</td>
                <td data-label={columns[2]}>
                  {row.before === null || row.now === null
                    ? t("No comparable")
                    : row.key === "adherence"
                      ? `${row.now - row.before > 0 ? "+" : ""}${number(row.now - row.before)} ${t("puntos porcentuales")}`
                      : `${row.now - row.before > 0 ? "+" : ""}${format(row.now - row.before, row.unit)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <>
      <div className="nutrition-review-periods">
        {[previous, current].map((period) => (
          <div key={period.adherence.cycleId}>
            <strong>
              {t("Ciclo {cycle}", { cycle: String(period.adherence.number) })}
            </strong>
            <p>
              {period.adherence.from && period.adherence.through
                ? `${date(period.adherence.from)} – ${date(period.adherence.through)}`
                : t("Sin fechas transcurridas")}
            </p>
            <p>
              {t("{actual} de {total}", {
                actual: String(period.adherence.daysWithData),
                total: String(period.adherence.elapsedDays),
              })}{" "}
              · {t("Días con registros")}
            </p>
          </div>
        ))}
      </div>
      {table(t("Comparación conjunta · IA y paciente"), rows)}
      <details className="nutrition-review-origin-details">
        <summary>{t("Ver comparación separada por origen")}</summary>
        {(["ai_estimated", "patient_confirmed"] as const).map((origin) => (
          <div key={origin}>
            {table(
              t(
                origin === "ai_estimated"
                  ? "Solo registros estimados por IA"
                  : "Solo registros confirmados por el paciente",
              ),
              sourceRows(origin),
            )}
          </div>
        ))}
      </details>
      <p className="nutrition-review-help">
        {t(
          "Las diferencias son descriptivas, sin juicio clínico. Los períodos pueden tener distinta duración y cobertura; compara también el desglose por origen.",
        )}
      </p>
      <p className="nutrition-review-help">
        {t("Sin mediciones clínicas por período para comparar.")}
      </p>
    </>
  );
}
