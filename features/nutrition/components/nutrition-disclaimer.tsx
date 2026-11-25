"use client";
import { useT } from "@/providers/i18n-provider";

/** Aviso solicitado para las recomendaciones automáticas, conservado íntegro. */
export function NutritionDisclaimer() {
  const t = useT();
  return <section className="nutrition-service-notice nutrition-legal-note flex flex-col gap-2" role="note" aria-label={t("Aviso sobre recomendaciones nutricionales")}>
    <h3 className="text-xs font-semibold">{t("IMPORTANT DISCLAIMER – NUTRITIONAL RECOMMENDATIONS")}</h3>
    <p className="text-xs leading-relaxed">{t("Este plan de alimentación se genera automáticamente con tus respuestas al cuestionario. Ofrece información general de bienestar. Para una evaluación individual, consulta a un profesional de la nutrición debidamente habilitado.")}</p>
    <p className="text-xs leading-relaxed">{t("Antes de seguir el plan, solicita la revisión de un profesional de la nutrición habilitado. Los resultados varían de una persona a otra. Consulta a tu equipo de salud sobre tus necesidades individuales.")}</p>
  </section>;
}
