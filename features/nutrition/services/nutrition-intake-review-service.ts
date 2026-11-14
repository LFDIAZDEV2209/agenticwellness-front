import { apiFetch, ApiError } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import { NutritionRequestError } from "./nutrition-service";
import { intakeDate, intakeDates } from "./nutrition-intake-service";

/** DTO real de 3.8a, verificado contra BACK 433c481; separado de la lectura 3.7. */
export interface IntakeDayReview {
  localDate: string;
  hasRecords: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  unreviewed: boolean;
  modifiedSinceReview: boolean;
}
const root = "/api/v1/nutrition";
const reviews = (cycleId: string) =>
  `${root}/cycles/${encodeURIComponent(cycleId)}/days`;

export async function intakeReviewRequest<T>(
  path: string,
  signal: AbortSignal,
  map: (value: T) => T,
  method = "GET",
) {
  try {
    const value = await apiFetch<T>(`${env.apiUrl}${path}`, {
      signal,
      method,
      cache: "no-store",
    });
    try {
      return map(value);
    } catch {
      throw new NutritionRequestError({
        kind: "contract",
        endpoint: `${method} ${path.split("?")[0]}`,
        status: 502,
      });
    }
  } catch (error) {
    if (error instanceof NutritionRequestError) throw error;
    const status = error instanceof ApiError ? error.status : 0;
    throw new NutritionRequestError({
      kind: [404, 501].includes(status) ? "endpoint" : "request",
      endpoint: `${method} ${path.split("?")[0]}`,
      status,
    });
  }
}
function reviewRow(row: IntakeDayReview, date: string) {
  if (
    !row ||
    row.localDate !== date ||
    typeof row.hasRecords !== "boolean" ||
    typeof row.unreviewed !== "boolean" ||
    typeof row.modifiedSinceReview !== "boolean" ||
    !(
      row.reviewedAt === null ||
      (typeof row.reviewedAt === "string" &&
        Number.isFinite(Date.parse(row.reviewedAt)))
    ) ||
    !(row.reviewedBy === null || typeof row.reviewedBy === "string") ||
    (row.modifiedSinceReview && (!row.reviewedAt || !row.unreviewed))
  )
    throw new Error("intake-review-contract");
  intakeDate(row.localDate);
  return row;
}
export function fetchIntakeDayReviews(
  cycleId: string,
  from: string,
  to: string,
  signal: AbortSignal,
) {
  const dates = intakeDates(from, to);
  return intakeReviewRequest<IntakeDayReview[]>(
    `${reviews(cycleId)}/reviews?${new URLSearchParams({ from, to })}`,
    signal,
    (value) => {
      if (
        !Array.isArray(value) ||
        value.length !== dates.length ||
        new Set(value.map((row) => row.localDate)).size !== dates.length
      )
        throw new Error("intake-reviews-contract");
      return value.map((row) =>
        reviewRow(row, dates.find((date) => date === row.localDate) ?? ""),
      );
    },
  );
}
export function setIntakeDayReviewed(
  cycleId: string,
  date: string,
  reviewed: boolean,
  signal: AbortSignal,
) {
  return intakeReviewRequest<IntakeDayReview>(
    `${reviews(cycleId)}/${encodeURIComponent(date)}/review`,
    signal,
    (value) => reviewRow(value, date),
    reviewed ? "POST" : "DELETE",
  );
}
export async function fetchUnreviewedIntakeCount(signal: AbortSignal) {
  const result = await intakeReviewRequest<{ days: number }>(
    `${root}/intake/unreviewed-count`,
    signal,
    (value) => {
      if (!value || !Number.isInteger(value.days) || value.days < 0)
        throw new Error("intake-count-contract");
      return value;
    },
  );
  return result.days;
}
