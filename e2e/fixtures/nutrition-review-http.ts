import type { Page } from "@playwright/test";
import type { IntakeDay } from "../../features/nutrition/types/nutrition-intake";
import { intakeToday, mockIntakeHttp } from "./nutrition-intake-http";

/** Contratos reales 3.7, 3.8a y 3.8b con datos y HTTP íntegramente sintéticos. */
export async function mockIntakeReviewHttp(
  page: Page,
  options: {
    readonly?: boolean;
    noPhotos?: boolean;
    missingReviews?: boolean;
    missingCount?: boolean;
    english?: boolean;
    missingHighlights?: boolean;
    badOrigin?: boolean;
    noCycle?: boolean;
  } = {},
) {
  const days = new Map<string, IntakeDay>();
  const state = {
    reviews: new Set<string>(),
    modified: new Set<string>(),
    highlights: new Map<string, string | null>(),
    writes: [] as { method: string; path: string; body: unknown }[],
    reads: [] as string[],
    failWrite: false,
    failRead: false,
    badReviews: false,
    failPin: false,
    delayed: false,
    release: () => {},
    count: 7,
    extraHighlights: 0,
    highlightPages: [] as number[],
  };
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.release = release;
  const base = await mockIntakeHttp(page, {
    canManage: !options.readonly,
    noPhotos: options.noPhotos,
    english: options.english,
    transformDay(day) {
      day.records = day.records.map((row) => ({
        ...row,
        id: `${day.localDate}-${row.id}`,
      }));
      if (day.localDate === intakeToday && day.records.length) {
        const example = structuredClone(day.records[0]);
        example.id = `${intakeToday}-outside-menu`;
        example.mealCode = "cen";
        example.photo = null;
        example.patientCorrection = false;
        example.recorded.calories = 698;
        day.records.push(example);
        day.menu!.meals = day.menu!.meals.filter(
          (meal) => meal.mealCode !== "cen",
        );
        if (state.modified.has(day.localDate))
          day.records[0].recorded.calories = 920;
        if (options.badOrigin) day.records[0].origin = "clinical" as never;
      }
      days.set(day.localDate, structuredClone(day));
      if (options.noCycle) {
        day.cycleId = null;
        day.cycleNumber = null;
        day.menu = null;
      }
      return day;
    },
  });
  if (options.noCycle) {
    const patient = base.store.get("demo-patient-2")!;
    patient.cycle = null;
    patient.publishedCycle = null;
  }
  const row = (localDate: string) => {
    const hasRecords = !!days.get(localDate)?.records.length;
    const reviewed = state.reviews.has(localDate);
    const modified = reviewed && state.modified.has(localDate);
    return {
      localDate,
      hasRecords,
      reviewedAt: reviewed ? "2026-11-14T16:00:00Z" : null,
      reviewedBy: reviewed ? "synthetic-professional" : null,
      unreviewed: hasRecords && (!reviewed || modified),
      modifiedSinceReview: modified,
    };
  };
  await page.route("**/api/v1/nutrition/intake/unreviewed-count", (route) => {
    state.reads.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: options.missingCount ? 404 : 200,
      json: options.missingCount ? {} : { days: state.count },
    });
  });
  await page.route("**/api/v1/nutrition/cycles/*/days/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (json: unknown, status = 200) =>
      route.fulfill({ status, json });
    if (request.method() === "GET") {
      state.reads.push(url.pathname);
      if (options.missingReviews) return reply({}, 404);
      if (state.failRead) return reply({}, 503);
      if (state.badReviews) return reply([{ localDate: intakeToday }]);
      const from = url.searchParams.get("from")!;
      const to = url.searchParams.get("to")!;
      return reply(
        [...days.keys()].filter((date) => date >= from && date <= to).map(row),
      );
    }
    const day = decodeURIComponent(url.pathname.split("/").at(-2)!);
    state.writes.push({
      method: request.method(),
      path: url.pathname,
      body: request.postData(),
    });
    if (options.readonly) return reply({}, 403);
    if (state.delayed) await gate;
    if (state.failWrite) return reply({}, 503);
    const before = row(day).unreviewed;
    if (request.method() === "POST") {
      state.reviews.add(day);
      state.modified.delete(day);
    } else if (request.method() === "DELETE") {
      state.reviews.delete(day);
      state.modified.delete(day);
    } else return reply({}, 405);
    const after = row(day).unreviewed;
    state.count += Number(after) - Number(before);
    return reply(row(day));
  });
  await page.route(
    "**/api/v1/nutrition/cycles/*/highlights**",
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const parts = path.split("/");
      const recordId = decodeURIComponent(parts[7] ?? "");
      if (request.method() === "GET") {
        state.reads.push(path);
        if (options.missingHighlights)
          return route.fulfill({ status: 404, json: {} });
        if (state.failRead) return route.fulfill({ status: 503, json: {} });
        const page = Number(url.searchParams.get("page"));
        const pageSize = Number(url.searchParams.get("pageSize"));
        state.highlightPages.push(page);
        const sample = {
          localDate: intakeToday,
          mealCode: "alm",
          recorded: {
            calories: 890,
            proteinG: 24,
            carbsG: 55,
            fatG: 12,
            fiberG: 8,
          },
          waterMl: null,
          pinnedBy: "synthetic-professional",
          pinnedAt: "2026-11-14T17:00:00Z",
          note: null,
        };
        const items = [
          ...Array.from({ length: state.extraHighlights }, (_, index) => ({
            ...sample,
            intakeLogId: `other-example-${index}`,
          })),
          ...[...state.highlights].map(([intakeLogId, note]) => ({
            ...sample,
            intakeLogId,
            note,
            recorded:
              [...days.values()]
                .flatMap((day) => day.records)
                .find((row) => row.id === intakeLogId)?.recorded ??
              sample.recorded,
          })),
        ];
        return route.fulfill({
          json: {
            page,
            pageSize,
            total: items.length,
            items: items.slice((page - 1) * pageSize, page * pageSize),
          },
        });
      }
      state.writes.push({
        method: request.method(),
        path,
        body: request.postData() ? request.postDataJSON() : null,
      });
      if (options.readonly) return route.fulfill({ status: 403, json: {} });
      if (state.failPin) return route.fulfill({ status: 503, json: {} });
      if (request.method() === "POST")
        state.highlights.set(recordId, request.postDataJSON().note);
      else if (request.method() === "DELETE") state.highlights.delete(recordId);
      return route.fulfill({ status: 204 });
    },
  );
  return { ...base, intakeState: base.state, state, days };
}
