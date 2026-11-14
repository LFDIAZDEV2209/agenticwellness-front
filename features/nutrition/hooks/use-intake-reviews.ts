"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNutritionResource } from "./use-nutrition-resource";
import { addIntakeDays } from "../services/nutrition-intake-service";
import {
  fetchIntakeDayReviews,
  setIntakeDayReviewed,
} from "../services/nutrition-intake-review-service";
import type { IntakeDay } from "../types/nutrition-intake";
import type { NutritionScope } from "../types/nutrition";

const changed = "nutrition-intake-review-changed";
export function notifyIntakeReviewChanged() {
  window.dispatchEvent(new Event(changed));
}
export function useIntakeReviewResource<T>(
  load: (signal: AbortSignal, scope: NutritionScope) => Promise<T>,
) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(changed, refresh);
    return () => window.removeEventListener(changed, refresh);
  }, []);
  return useNutritionResource(load, String(revision));
}

/** Rangos contiguos: la continuidad antigua no convierte una consulta en un historial ilimitado. */
export function useIntakeReviews(days: IntakeDay[]) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const ranges: { cycleId: string; from: string; to: string }[] = [];
      for (const day of [...days]
        .filter((day) => day.cycleId)
        .sort((a, b) => a.localDate.localeCompare(b.localDate))) {
        const previous = ranges.at(-1);
        if (
          previous?.cycleId === day.cycleId &&
          addIntakeDays(previous.to, 1) === day.localDate &&
          day.localDate <= addIntakeDays(previous.from, 99)
        )
          previous.to = day.localDate;
        else
          ranges.push({
            cycleId: day.cycleId!,
            from: day.localDate,
            to: day.localDate,
          });
      }
      return (
        await Promise.all(
          ranges.map((range) =>
            fetchIntakeDayReviews(range.cycleId, range.from, range.to, signal),
          ),
        )
      ).flat();
    },
    [days],
  );
  return useIntakeReviewResource(load);
}

/** Sin optimismo: el estado cambia solo tras confirmación HTTP y una nueva lectura. */
export function useIntakeReviewMutation() {
  const running = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{
    busy: boolean;
    error: boolean;
    action?: "mark" | "unmark";
  }>({ busy: false, error: false });
  useEffect(() => () => running.current?.abort(), []);
  async function setReviewed(day: IntakeDay, reviewed: boolean) {
    if (running.current || !day.cycleId) return;
    const controller = new AbortController();
    running.current = controller;
    setResult({ busy: true, error: false });
    try {
      await setIntakeDayReviewed(
        day.cycleId,
        day.localDate,
        reviewed,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setResult({
          busy: false,
          error: false,
          action: reviewed ? "mark" : "unmark",
        });
        notifyIntakeReviewChanged();
      }
    } catch {
      if (!controller.signal.aborted) setResult({ busy: false, error: true });
    } finally {
      if (running.current === controller) running.current = null;
    }
  }
  return { ...result, setReviewed };
}
