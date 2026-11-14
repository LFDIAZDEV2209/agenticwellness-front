import type { Page } from "@playwright/test";
import { mockPatientsHttp } from "./patients-http";
import type {
  ExerciseRoutine,
  CreateExerciseRoutineInput,
} from "../../features/wellness/types";
import type { MediaInput, MediaItem } from "../../features/media/types";

export async function mockExerciseDemo(page: Page) {
  const base = await mockPatientsHttp(page, {
    permissions: [
      "Wellness.View",
      "Wellness.Manage",
      "Media.View",
      "Media.Create",
      "Media.Publish",
    ],
  });
  const file: MediaItem = {
    id: "00000000-0000-4000-8000-000000000850",
    title: "Imagen de técnica QA",
    author: "Equipo QA",
    description: null,
    category: "SaludFisica",
    mediaType: "Image",
    status: "Published",
    storageKey: "media/qa-image.png",
    thumbnailKey: null,
    contentType: "image/png",
    fileSizeBytes: 100,
    durationSecs: null,
    sortOrder: 0,
    day: 0,
    month: 0,
    publishedAt: "2026-11-14",
    createdAt: "2026-11-14",
    updatedAt: null,
    createdBy: null,
  };
  const routine: ExerciseRoutine = {
    id: "00000000-0000-4000-8000-000000000851",
    name: "Rutina QA",
    description: null,
    difficulty: "Facil",
    category: "Cardio",
    status: "Active",
    estimatedMinutes: 15,
    targetMuscles: null,
    equipment: null,
    warmupNotes: null,
    cooldownNotes: null,
    mediaId: null,
    createdAt: "2026-11-14",
    updatedAt: null,
    createdBy: null,
    exercises: [
      {
        id: "qa-exercise",
        name: "Movimiento QA",
        description: null,
        sets: 2,
        repetitions: 10,
        restSeconds: 30,
        durationSecs: null,
        weightKg: null,
        targetMuscle: null,
        equipment: null,
        tempo: null,
        rpe: null,
        tips: null,
        mediaId: file.id,
        sortOrder: 0,
      },
    ],
  };
  const store = new Map<string, MediaItem>([[file.id, file]]);
  const state = {
    publishFails: false,
    hold: false,
    creates: [] as MediaInput[],
    publishes: [] as string[],
    saves: [] as CreateExerciseRoutineInput[],
    signed: [] as string[],
  };
  // Nunca se conecta a los proveedores externos durante QA.
  await page.route(
    /^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com)\//,
    (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<p>Video QA</p>",
      }),
  );
  await page.route("**/api/v1/storage/sign**", (route) => {
    state.signed.push(route.request().url());
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ url: "/qa-image-demo" }),
    });
  });
  await page.route("**/qa-image-demo", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK8sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route("**/api/v1/media**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/api/v1/media" && req.method() === "POST") {
      const input = req.postDataJSON() as MediaInput;
      state.creates.push(input);
      const item = {
        ...file,
        ...input,
        id: `00000000-0000-4000-8000-${String(860 + state.creates.length).padStart(12, "0")}`,
        storageKey: `external/${input.provider}/qa`,
        status: "Draft" as const,
      };
      store.set(item.id, item);
      return reply(item);
    }
    if (url.pathname.endsWith("/publish") && req.method() === "POST") {
      const id = url.pathname.split("/").at(-2)!;
      state.publishes.push(id);
      while (state.hold)
        await new Promise((resolve) => setTimeout(resolve, 20));
      if (state.publishFails) return reply({ detail: "Fallo sintético" }, 503);
      store.get(id)!.status = "Published";
      return reply({ id, status: "Published" });
    }
    if (url.pathname === "/api/v1/media" && req.method() === "GET")
      return reply({
        items: url.searchParams.get("mediaType") === "Image" ? [file] : [],
        totalCount: 1,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      });
    const item = store.get(url.pathname.split("/").at(-1)!);
    return item ? reply(item) : route.fallback();
  });
  await page.route("**/api/v1/wellness/exercise-routines**", (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const reply = (body: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (["PUT", "POST"].includes(req.method())) {
      state.saves.push(req.postDataJSON());
      return reply({ ...routine, ...req.postDataJSON() });
    }
    if (path.endsWith(routine.id)) return reply(routine);
    return reply({
      data: [routine],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });
  return { ...base, state, store, routine, file };
}
