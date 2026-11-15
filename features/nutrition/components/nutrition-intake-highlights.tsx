"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/providers/context-provider";
import { useT } from "@/providers/i18n-provider";
import {
  useIntakeReviewResource,
  notifyIntakeReviewChanged,
} from "../hooks/use-intake-reviews";
import type { IntakeDay } from "../types/nutrition-intake";
import {
  fetchIntakeHighlights,
  setIntakeHighlight,
} from "../services/nutrition-intake-highlights-service";

/** Modelo de presentación; el adaptador conserva el DTO real en el servicio. */
export interface IntakeHighlight {
  recordId: string;
  note: string | null;
}
export interface IntakeHighlightsPort {
  list: (cycleId: string, signal: AbortSignal) => Promise<IntakeHighlight[]>;
  pin: (
    cycleId: string,
    recordId: string,
    note: string | null,
    signal: AbortSignal,
  ) => Promise<void>;
  unpin: (
    cycleId: string,
    recordId: string,
    signal: AbortSignal,
  ) => Promise<void>;
}
const port: IntakeHighlightsPort = {
  async list(cycleId, signal) {
    return (await fetchIntakeHighlights(cycleId, signal)).map((item) => ({
      recordId: item.intakeLogId,
      note: item.note,
    }));
  },
  async pin(cycleId, recordId, note, signal) {
    await setIntakeHighlight(cycleId, recordId, note, true, signal);
  },
  async unpin(cycleId, recordId, signal) {
    await setIntakeHighlight(cycleId, recordId, null, false, signal);
  },
};
export function useIntakeHighlights(days: IntakeDay[]) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const cycles = [
        ...new Set(days.flatMap((day) => (day.cycleId ? [day.cycleId] : []))),
      ];
      return await Promise.all(
        cycles.map(async (cycleId) => ({
          cycleId,
          items: await port.list(cycleId, signal),
        })),
      );
    },
    [days],
  );
  const resource = useIntakeReviewResource(load);
  return { ...resource, port };
}

export function NutritionIntakeHighlightActions({
  day,
  recordId,
  highlight,
  ready,
  port,
  retry,
}: {
  day: IntakeDay;
  recordId: string;
  highlight?: IntakeHighlight;
  ready: boolean;
  port: IntakeHighlightsPort;
  retry: () => void;
}) {
  const t = useT();
  const { can } = useAppContext();
  const inputId = useId();
  const [note, setNote] = useState(highlight?.note ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);
  const notesAllowed = can("Nutrition.NotesView");
  const isWater = day.records.some(row => row.id === recordId && row.mealCode === "agua");
  async function save() {
    if (isWater || !day.cycleId || !ready || !can("Nutrition.Manage") || inFlight.current)
      return;
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus("saving");
    try {
      if (highlight) await port.unpin(day.cycleId, recordId, controller.signal);
      else
        await port.pin(
          day.cycleId,
          recordId,
          notesAllowed && note.trim() ? note.trim() : null,
          controller.signal,
        );
      if (!controller.signal.aborted) {
        setStatus("saved");
        notifyIntakeReviewChanged();
      }
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }
  if (isWater) return null;
  return (
    <section
      className="nutrition-intake-highlight"
      aria-label={t("Ejemplo para el cierre")}
    >
      {highlight && (
        <p>
          <Star aria-hidden="true" className="size-4" />
          {t("Ejemplo anclado")}
        </p>
      )}
      {highlight?.note && notesAllowed && <p>{highlight.note}</p>}
      {can("Nutrition.Manage") && (
        <>
          {!highlight && notesAllowed && (
            <div>
              <label htmlFor={inputId}>
                {t("Nota interna del ejemplo (opcional)")}
              </label>
              <Textarea
                id={inputId}
                name="highlightNote"
                rows={2}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={status === "saving"}
              />
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!ready || !day.cycleId || status === "saving"}
            onClick={() => void save()}
          >
            <Star aria-hidden="true" className="size-4" />
            {t(
              status === "saving"
                ? "Guardando ejemplo…"
                : highlight
                  ? "Quitar ejemplo anclado"
                  : "Anclar como ejemplo",
            )}
          </Button>
        </>
      )}
      {!ready && (
        <p>
          {t(
            "No hay una lectura válida de ejemplos. Actualiza antes de guardar.",
          )}{" "}
          <Button variant="ghost" size="sm" onClick={retry}>
            {t("Actualizar ejemplos")}
          </Button>
        </p>
      )}
      {status === "saved" && ready && (
        <p role="status">{t("Cambio del ejemplo confirmado.")}</p>
      )}
      {status === "error" && (
        <div role="alert" aria-label={t("No se guardó el ejemplo")}>
          <p>
            {t(
              "No se pudo guardar el ejemplo. Comprueba el estado antes de reintentarlo.",
            )}
          </p>
          <Button variant="outline" onClick={retry}>
            {t("Actualizar ejemplos")}
          </Button>
        </div>
      )}
    </section>
  );
}
