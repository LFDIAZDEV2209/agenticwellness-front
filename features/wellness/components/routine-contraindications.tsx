"use client";
import { TriangleAlert } from "lucide-react";
import { useT } from "@/providers/i18n-provider";

/** Muestra el texto clínico guardado, sin inferir condiciones del paciente. */
export function RoutineContraindications({ text }: { text?: string | null }) {
  const t = useT();
  if (!text?.trim()) return null;
  return (
    <section
      role="note"
      aria-label={t("Contraindicaciones")}
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-warning/30 bg-warning-soft p-4 text-warning-soft-foreground"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <TriangleAlert aria-hidden className="size-4 shrink-0" />
        {t("Contraindicaciones")}
      </h3>
      <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
      <p className="text-xs">
        {t("Revisa estas indicaciones antes de asignar la rutina.")}
      </p>
    </section>
  );
}
