"use client";

import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/providers/context-provider";
import { useT } from "@/providers/i18n-provider";
import {
  useIntakeReviewMutation,
  useIntakeReviewResource,
} from "../hooks/use-intake-reviews";
import {
  fetchUnreviewedIntakeCount,
  type IntakeDayReview,
} from "../services/nutrition-intake-review-service";
import type { IntakeDay } from "../types/nutrition-intake";

export function IntakeReviewStatus({ review }: { review?: IntakeDayReview }) {
  const t = useT();
  return (
    <span
      className="nutrition-intake-review-status"
      data-reviewed={(review?.reviewedAt && !review.unreviewed) || undefined}
    >
      {t(
        !review
          ? "Revisión no disponible"
          : review.modifiedSinceReview
            ? "Modificado tras tu revisión"
            : review.reviewedAt && !review.unreviewed
              ? "Revisado"
              : review.hasRecords
                ? "Sin revisar"
                : "Sin registros que revisar",
      )}
    </span>
  );
}

export function NutritionIntakeReviewActions({
  day,
  review,
  loading,
  error,
  retry,
}: {
  day: IntakeDay;
  review?: IntakeDayReview;
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  const t = useT();
  const { can } = useAppContext();
  const mutation = useIntakeReviewMutation();
  const reviewed = !!review?.reviewedAt && !review.unreviewed;
  return (
    <div className="nutrition-intake-review-actions">
      <p>
        {t(
          "La revisión se aplica al día completo, aunque haya filtros activos.",
        )}
      </p>
      <IntakeReviewStatus review={review} />
      {loading ? (
        <span role="status">{t("Consultando revisión…")}</span>
      ) : error ? (
        <p role="status">
          {t(
            "La revisión diaria aún no está disponible. Puedes seguir consultando las comidas.",
          )}{" "}
          <Button variant="outline" size="sm" onClick={retry}>
            {t("Reintentar revisión")}
          </Button>
        </p>
      ) : null}
      {can("Nutrition.Manage") && (
        <>
          <Button
            variant={reviewed ? "outline" : "default"}
            disabled={!review || loading || mutation.busy || !day.cycleId}
            onClick={() => void mutation.setReviewed(day, !reviewed)}
          >
            <Check aria-hidden="true" className="size-4" />
            {t(
              mutation.busy
                ? "Guardando revisión…"
                : reviewed
                  ? "Deshacer revisión"
                  : review?.modifiedSinceReview
                    ? "Volver a marcar como revisado"
                    : "Marcar día como revisado",
            )}
          </Button>
          {mutation.action === "mark" && reviewed && (
            <span role="status">{t("Día marcado como revisado.")}</span>
          )}
          {review?.modifiedSinceReview && (
            <Button
              variant="outline"
              disabled={loading || mutation.busy || !day.cycleId}
              onClick={() => void mutation.setReviewed(day, false)}
            >
              {t("Deshacer revisión")}
            </Button>
          )}
          {mutation.action === "unmark" && review && !reviewed && (
            <span role="status">{t("Revisión deshecha.")}</span>
          )}
          {mutation.error && (
            <div role="alert" aria-label={t("No se guardó la revisión")}>
              <p>
                {t(
                  "No se pudo guardar el cambio de revisión. Comprueba el estado antes de reintentarlo.",
                )}
              </p>
              <Button variant="outline" size="sm" onClick={retry}>
                <RotateCcw aria-hidden="true" className="size-4" />
                {t("Actualizar estado")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function NutritionIntakePendingCount() {
  const { can } = useAppContext();
  if (!can("Nutrition.View") || !can("Nutrition.RecordsView")) return null;
  return <PendingCount />;
}
function PendingCount() {
  const t = useT();
  const { data, loading, error, retry } = useIntakeReviewResource(
    fetchUnreviewedIntakeCount,
  );
  return (
    <div
      className="nutrition-intake-pending-count"
      role="status"
      aria-label={t("Días pendientes de revisión")}
    >
      <p>
        {loading
          ? t("Consultando días sin revisar…")
          : error || data === undefined
            ? t("El contador de revisión no está disponible.")
            : t("{count} días sin revisar", { count: String(data) })}
      </p>
      <span>
        {t(
          "Solo pacientes de tu alcance. El contador no se limita a esta página.",
        )}
      </span>
      {error && (
        <Button variant="ghost" size="sm" onClick={retry}>
          {t("Reintentar contador")}
        </Button>
      )}
    </div>
  );
}
