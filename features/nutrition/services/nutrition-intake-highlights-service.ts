import { apiFetch, ApiError } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import { NutritionRequestError } from "./nutrition-service";
import { intakeDate } from "./nutrition-intake-service";
import type { IntakeMacros } from "../types/nutrition-intake";

/** Contrato real 3.8b (19acc16); sin fotos, claves ni copia del análisis. */
export interface IntakeExampleDto {
  intakeLogId: string;
  localDate: string;
  mealCode: string;
  recorded: IntakeMacros;
  waterMl: number | null;
  pinnedBy: string;
  pinnedAt: string;
  note: string | null;
}
interface IntakeExamplesPage {
  page: number;
  pageSize: number;
  total: number;
  items: IntakeExampleDto[];
}
const path = (cycleId: string) =>
  `/api/v1/nutrition/cycles/${encodeURIComponent(cycleId)}/highlights`;

export async function fetchIntakeHighlights(
  cycleId: string,
  signal: AbortSignal,
) {
  const endpoint = path(cycleId);
  const items: IntakeExampleDto[] = [];
  let total: number | undefined;
  // Lista paginada de referencias, no ingestas/fotos: no inferir «sin anclar» de una página parcial.
  for (let page = 1; total === undefined || items.length < total; page++) {
    let wire: IntakeExamplesPage;
    try {
      wire = await apiFetch<IntakeExamplesPage>(
        `${env.apiUrl}${endpoint}?${new URLSearchParams({ page: String(page), pageSize: "100" })}`,
        { signal, cache: "no-store" },
      );
    } catch (error) {
      throw new NutritionRequestError({
        kind: "request",
        endpoint: `GET ${endpoint}`,
        status: error instanceof ApiError ? error.status : 0,
      });
    }
    try {
      if (
        !wire ||
        wire.page !== page ||
        wire.pageSize !== 100 ||
        !Number.isInteger(wire.total) ||
        wire.total < 0 ||
        (total !== undefined && total !== wire.total) ||
        !Array.isArray(wire.items) ||
        wire.items.length !==
          Math.min(100, Math.max(0, wire.total - (page - 1) * 100))
      )
        throw new Error("intake-examples-page-contract");
      total = wire.total;
      for (const item of wire.items) {
        if (
          !item ||
          typeof item.intakeLogId !== "string" ||
          typeof item.mealCode !== "string" ||
          typeof item.pinnedBy !== "string" ||
          !Number.isFinite(Date.parse(item.pinnedAt)) ||
          !(item.note === null || typeof item.note === "string") ||
          !item.recorded ||
          ![
            item.recorded.calories,
            item.recorded.carbsG,
            item.recorded.proteinG,
            item.recorded.fatG,
            item.recorded.fiberG,
            item.waterMl,
          ].every(
            (n) =>
              n === null ||
              (typeof n === "number" && Number.isFinite(n) && n >= 0),
          ) ||
          items.some((row) => row.intakeLogId === item.intakeLogId)
        )
          throw new Error("intake-example-contract");
        intakeDate(item.localDate);
        items.push(item);
      }
    } catch {
      throw new NutritionRequestError({
        kind: "contract",
        endpoint: `GET ${endpoint}`,
        status: 502,
      });
    }
  }
  return items;
}
export async function setIntakeHighlight(
  cycleId: string,
  intakeId: string,
  note: string | null,
  pinned: boolean,
  signal: AbortSignal,
) {
  await apiFetch(
    `${env.apiUrl}${path(cycleId)}/${encodeURIComponent(intakeId)}`,
    {
      signal,
      method: pinned ? "POST" : "DELETE",
      ...(pinned ? { body: JSON.stringify({ note }) } : {}),
    },
  );
}
