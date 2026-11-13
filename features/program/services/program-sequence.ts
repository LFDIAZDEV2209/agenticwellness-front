import type { WeeklyDayTask, WeeklyDayTaskInput } from "../types";

export const SEQUENCE_DAYS = 83;
export const SEQUENCE_WEEKS = 12;
export const MIN_REPEAT_DISTANCE = 42;
export type PodcastSequence = (string | null)[];

/** Lectura efectiva de 1.7: una fila específica, incluso vacía, gana a la genérica. */
export function resolvePodcastSequence(
  rows: readonly WeeklyDayTask[],
): PodcastSequence {
  return Array.from({ length: SEQUENCE_DAYS }, (_, index) => {
    const weekday = (index % 7) + 1;
    const week = Math.floor(index / 7) + 1;
    return (
      (
        rows.find(
          (row) =>
            row.taskCode === "podcast" &&
            row.weekday === weekday &&
            row.weekNumber === week,
        ) ??
        rows.find(
          (row) =>
            row.taskCode === "podcast" &&
            row.weekday === weekday &&
            row.weekNumber == null,
        )
      )?.mediaId ?? null
    );
  });
}

export function sequenceStats(
  sequence: readonly (string | null)[],
  publishedIds: ReadonlySet<string>,
) {
  const seen = new Set<string>();
  let gaps = 0;
  let repeats = 0;
  for (const id of sequence.slice(0, SEQUENCE_DAYS)) {
    if (!id || !publishedIds.has(id)) {
      gaps += 1;
      continue;
    }
    if (seen.has(id)) repeats += 1;
    seen.add(id);
  }
  return { gaps, repeats, assigned: SEQUENCE_DAYS - gaps };
}

export function swapPodcastDays(
  sequence: PodcastSequence,
  from: number,
  to: number,
): PodcastSequence {
  if (
    from < 0 ||
    to < 0 ||
    from >= SEQUENCE_DAYS ||
    to >= SEQUENCE_DAYS ||
    from === to
  )
    return sequence;
  const next = [...sequence];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Regla C1: ciclo completo del catálogo en orden, sin repeticiones antes de 42 días. */
export function autocompletePodcasts(
  sequence: PodcastSequence,
  orderedIds: readonly string[],
  rebuild = false,
): PodcastSequence | null {
  const ids = [...new Set(orderedIds)];
  if (ids.length < MIN_REPEAT_DISTANCE) return null;
  if (rebuild)
    return Array.from(
      { length: SEQUENCE_DAYS },
      (_, index) => ids[index % ids.length],
    );
  const valid = new Set(ids);
  const next = sequence.map((id) => (id && valid.has(id) ? id : null));
  // No corregir silenciosamente una elección manual: el botón de rehacer es explícito.
  for (let index = 0; index < next.length; index += 1) {
    if (
      next[index] &&
      next
        .slice(Math.max(0, index - MIN_REPEAT_DISTANCE + 1), index)
        .includes(next[index])
    )
      return null;
  }
  for (let index = 0; index < SEQUENCE_DAYS; index += 1) {
    if (next[index]) continue;
    const neighbors = new Set(
      next.slice(
        Math.max(0, index - MIN_REPEAT_DISTANCE + 1),
        Math.min(SEQUENCE_DAYS, index + MIN_REPEAT_DISTANCE),
      ),
    );
    next[index] =
      Array.from(
        { length: ids.length },
        (_, offset) => ids[(index + offset) % ids.length],
      ).find((id) => !neighbors.has(id)) ?? null;
  }
  return next;
}

export function changedSequenceWeeks(
  before: PodcastSequence,
  after: PodcastSequence,
): number[] {
  return Array.from({ length: SEQUENCE_WEEKS }, (_, index) => index + 1).filter(
    (week) => {
      const start = (week - 1) * 7;
      return after
        .slice(start, Math.min(start + 7, SEQUENCE_DAYS))
        .some((id, index) => id !== before[start + index]);
    },
  );
}

/** Se envía exclusivamente podcast. 1.7b conserva las demás clases en el servidor. */
export function podcastWeekPayload(
  rows: readonly WeeklyDayTask[],
  sequence: PodcastSequence,
  week: number,
): WeeklyDayTaskInput[] {
  if (!Number.isInteger(week) || week < 1 || week > SEQUENCE_WEEKS)
    throw new Error("INVALID_SEQUENCE_WEEK");
  const days = week === SEQUENCE_WEEKS ? 6 : 7;
  return Array.from({ length: days }, (_, index) => {
    const weekday = index + 1;
    const existing =
      rows.find(
        (row) =>
          row.taskCode === "podcast" &&
          row.weekday === weekday &&
          row.weekNumber === week,
      ) ??
      rows.find(
        (row) =>
          row.taskCode === "podcast" &&
          row.weekday === weekday &&
          row.weekNumber == null,
      );
    return {
      weekday,
      taskCode: "podcast",
      points: existing?.points ?? 80,
      sortOrder: existing?.sortOrder ?? weekday,
      mediaId: sequence[(week - 1) * 7 + index] ?? null,
    };
  });
}

export function mergeSequenceWeek(
  rows: readonly WeeklyDayTask[],
  response: readonly WeeklyDayTask[],
  week: number,
): WeeklyDayTask[] {
  return [
    ...rows.filter((row) => row.weekNumber !== week),
    ...response.map((row) => ({ ...row, weekNumber: week })),
  ];
}
