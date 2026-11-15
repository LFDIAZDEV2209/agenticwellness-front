import type { Page } from "@playwright/test";
import type { CycleClosing } from "../../features/nutrition/services/nutrition-cycle-closing-service";
import type { NutritionWorkspaceWire } from "../../features/nutrition/types/nutrition-wire";
import { intakePatient } from "./nutrition-intake-http";
import {
  mockCycleReviewHttp,
  reviewCycleId,
} from "./nutrition-cycle-review-http";
export const nextPlanId = "synthetic-next-plan";
/** 3.9 real con transporte, multipart y revisiones sintéticos; no reproduce persistencia real. */
export async function mockCycleClosingHttp(
  page: Page,
  options: {
    english?: boolean;
    noApprove?: boolean;
    noPhotos?: boolean;
    noPlan?: boolean;
    published?: boolean;
    aiDraft?: boolean;
    failRead?: boolean;
  } = {},
) {
  const base = await mockCycleReviewHttp(page, {
    firstCycle: true,
    english: options.english,
    canApprove: !options.noApprove,
    noPhotos: options.noPhotos,
  });
  const source = base.store.get(intakePatient)!;
  const next = structuredClone(source);
  next.cycle!.id = nextPlanId;
  next.cycle!.state = "en_aprobacion";
  next.cycle!.publishedVersionId = null;
  next.cycle!.version = 1;
  next.cycle!.startDate = null;
  next.cycle!.endDate = null;
  next.revision = 4;
  const state = {
    review: null as CycleClosing | null,
    reads: 0,
    writes: [] as { method: string; path: string; body: unknown }[],
    planExists: !options.noPlan,
    failRead: !!options.failRead,
    failPlans: false,
    failWrite: 0,
    delayed: false,
    release: () => {},
    lostPublishResponse: false,
    publishedPlans: 0,
    notifications: 0,
    uploads: [] as string[],
    photoRequests: 0,
    expiredImage: false,
  };
  const empty = (): CycleClosing => ({
    cycleId: reviewCycleId,
    revision: 0,
    reviewedAt: "2026-11-14T17:00:00Z",
    publishedAt: null,
    professionalNotes: "Evaluación clínica interna",
    patientMessage: {
      es: "Recomendación final en español.",
      en: "Final recommendation in English.",
    },
    criticalAlertsConfirmed: false,
    aiDraftConfirmed: false,
    summary: {
      capturedAt: "2026-11-14T17:00:00Z",
      adherence: { daysWithData: 3, elapsedDays: 33, adherence: 0.64 },
      averages: { calories: 1350 },
    },
    aiDraft: options.aiDraft ? { opaque: "3.9 draft exists" } : null,
    attachments: [],
  });
  if (options.published) {
    state.review = empty();
    state.review.revision = 7;
    state.review.publishedAt = "2026-11-14T17:00:00Z";
  }
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.release = release;
  let resolveWorkspace: (v: NutritionWorkspaceWire) => void = () => {};
  const workspace = new Promise<NutritionWorkspaceWire>((resolve) => {
    resolveWorkspace = resolve;
  });
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (
      url.pathname ===
        `/api/v1/nutrition/patients/${intakePatient}/workspace` &&
      !url.searchParams.get("prescriptionId")
    ) {
      try {
        resolveWorkspace(await response.json());
      } catch {
        /* La navegación puede cancelar una respuesta sintética. */
      }
    }
  });
  const wireNext = () => ({ ...base.viewOf(next), cycleId: "next-cycle" });
  await page.route(
    `**/nutrition/patients/${intakePatient}/workspace?*`,
    async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("prescriptionId") !== nextPlanId)
        return route.fallback();
      const original = await workspace;
      return route.fulfill({ json: { ...original, toReview: wireNext() } });
    },
  );
  await page.route(
    `**/nutrition/patients/${intakePatient}/prescriptions**`,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const parts = url.pathname.split("/");
      const id = parts[7];
      const verb = parts[8];
      if (request.method() === "GET") {
        if (state.failPlans) return route.fulfill({ status: 503, json: {} });
        if (!id)
          return route.fulfill({
            json: [
              { ...base.viewOf(source), cycleId: reviewCycleId },
              ...(state.planExists ? [wireNext()] : []),
            ],
          });
        if (id === nextPlanId)
          return route.fulfill({ json: verb === "history" ? [] : wireNext() });
        return route.fallback();
      }
      if (id && id !== nextPlanId) return route.fallback();
      const body = request.postDataJSON();
      state.writes.push({ method: request.method(), path: url.pathname, body });
      if (!id) {
        state.planExists = true;
        next.cycle!.state = "borrador_ia";
        next.cycle!.meals[0].items[0].grams += 30;
        next.revision = 1;
        return route.fulfill({ json: wireNext(), status: 201 });
      }
      if (body.revision !== next.revision)
        return route.fulfill({
          status: 409,
          json: { detail: "Plan modificado" },
        });
      if (verb === "submit") next.cycle!.state = "en_aprobacion";
      if (verb === "save" && body.edit?.instructions)
        next.cycle!.instructions = body.edit.instructions;
      next.revision++;
      return route.fulfill({ json: wireNext() });
    },
  );
  const withUrls = () =>
    state.review
      ? {
          ...state.review,
          attachments: state.review.attachments.map((a) => ({
            ...a,
            url: `https://nutrition-attachment.example.invalid/${a.id}?sig=synthetic-${state.reads}&exp=1794675900`,
          })),
        }
      : null;
  const aiState = {
    status: "ok" as "ok" | "insufficient" | "unavailable",
    delay: false,
    release: () => {},
    aborted: false,
  };
  let releaseAi = () => {};
  const aiGate = new Promise<void>((resolve) => {
    releaseAi = resolve;
  });
  aiState.release = releaseAi;
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/review/ai-draft")) aiState.aborted = true;
  });
  await page.route(
    "https://nutrition-attachment.example.invalid/**",
    (route) => {
      state.photoRequests++;
      return route.fulfill(
        state.expiredImage
          ? { status: 403, body: "" }
          : {
              contentType: "image/png",
              body: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF7sAAAAASUVORK5CYII=",
                "base64",
              ),
            },
      );
    },
  );
  await page.route("**/nutrition/cycles/*/review**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "GET") {
      state.reads++;
      return route.fulfill(
        state.failRead
          ? { status: 503, json: {} }
          : {
              contentType: "application/json",
              body: JSON.stringify(withUrls()),
            },
      );
    }
    if (url.pathname.endsWith("/review/ai-draft")) {
      const body = req.postDataJSON();
      state.writes.push({ method: req.method(), path: url.pathname, body });
      if (aiState.delay) await aiGate;
      if (aiState.aborted) return;
      if (options.noApprove) return route.fulfill({ status: 403, json: {} });
      if (body.revision !== (state.review?.revision ?? 0))
        return route.fulfill({ status: 409, json: {} });
      if (aiState.status === "unavailable")
        return route.fulfill({
          json: {
            status: "unavailable",
            revision: body.revision,
            aiDraft: null,
            warningCode: "ai_unavailable",
            warning:
              body.language === "en"
                ? "The AI summary is unavailable. You can continue the manual review."
                : "El resumen de IA no está disponible. Puedes continuar la revisión manual.",
          },
        });
      const draft = {
        status: aiState.status,
        summary:
          aiState.status === "ok"
            ? "Resumen propuesto con datos del período."
            : "",
        patterns: [],
        gaps: ["Falta medición reciente"],
        draft: {
          es: aiState.status === "ok" ? "Propuesta IA para revisar." : "",
          en: aiState.status === "ok" ? "AI proposal to review." : "",
        },
        model: "synthetic-model",
        generatedAt: "2026-11-14T17:00:00Z",
        capturedAt: "2026-11-14T17:00:00Z",
        inputHash: "a".repeat(64),
        inputs: {
          cycleNumber: 1,
          startDate: "2026-10-13",
          endDate: "2026-11-14",
          language: body.language,
          aggregates: {
            daysWithRecords: 3,
            adherence: 0.09,
            avgCalories: 1350,
            avgProteinG: 56,
            avgCarbsG: 128.3,
            avgFatG: 28,
            avgFiberG: 18.7,
            avgWaterMl: 666.7,
          },
          mealCounts: { des: 3, alm: 2, mer: 1, cen: 1, agua: 0 },
          previousCycleAggregates: null,
          measurements: null,
          records: [],
        },
      };
      state.review = {
        ...(state.review ?? {...empty(),professionalNotes:null,patientMessage:{es:null,en:null}}),
        revision: body.revision + 1,
        aiDraft: draft,
        aiDraftConfirmed: false,
      };
      return route.fulfill({
        json: {
          status: aiState.status,
          revision: state.review.revision,
          aiDraft: draft,
          warningCode:
            aiState.status === "insufficient" ? "ai_insufficient_data" : null,
          warning:
            aiState.status === "insufficient"
              ? "No hay datos suficientes. Continúa manualmente."
              : null,
        },
      });
    }
    const multipart = req
      .headers()
      ["content-type"]?.startsWith("multipart/form-data");
    const raw = multipart
      ? (req.postDataBuffer()?.toString("utf8") ?? "")
      : null;
    const body = raw ?? (req.postData() ? req.postDataJSON() : null);
    state.writes.push({ method: req.method(), path: url.pathname, body });
    if (options.noApprove) return route.fulfill({ status: 403, json: {} });
    if (state.delayed) await gate;
    if (state.failWrite)
      return route.fulfill({
        status: state.failWrite,
        json: { detail: "Fallo sintético de escritura" },
      });
    const rev = raw
      ? Number(raw.match(/name="revision"\r\n\r\n(\d+)/)?.[1])
      : req.method() === "DELETE"
        ? Number(url.searchParams.get("revision"))
        : body.revision;
    if (rev !== (state.review?.revision ?? 0) || state.review?.publishedAt)
      return route.fulfill({
        status: 409,
        json: { detail: "La revisión cambió" },
      });
    if (url.pathname.endsWith("/review")) {
      state.review = {
        ...(state.review ?? empty()),
        ...body,
        revision: rev + 1,
      };
      return route.fulfill({ json: withUrls() });
    }
    if (!state.review) return route.fulfill({ status: 422, json: {} });
    if (req.method() === "DELETE") {
      const attachmentId = url.pathname.split("/").at(-1);
      state.review.attachments = state.review.attachments.filter(
        (a) => a.id !== attachmentId,
      );
      state.review.revision++;
      return route.fulfill({ json: { revision: state.review.revision } });
    }
    if (!multipart)
      return route.fulfill({
        status: 400,
        json: { detail: "Se requiere multipart" },
      });
    state.uploads.push(raw!);
    const caption =
      raw!.match(/name="caption"\r\n\r\n([\s\S]*?)\r\n--/)?.[1] ?? null;
    const visible = raw!.includes('name="visibleToPatient"\r\n\r\ntrue');
    const pdf = raw!.includes("Content-Type: application/pdf");
    const attachment = {
      id: `synthetic-attachment-${state.uploads.length}`,
      kind: pdf ? ("document" as const) : ("image" as const),
      caption,
      visibleToPatient: visible,
      url: `https://nutrition-attachment.example.invalid/image?sig=synthetic`,
    };
    state.review.attachments.push(attachment);
    state.review.revision++;
    return route.fulfill({
      json: { revision: state.review.revision, attachment },
    });
  });
  await page.route("**/nutrition/cycles/*/publish", async (route) => {
    const req = route.request();
    const body = req.postDataJSON();
    state.writes.push({
      method: req.method(),
      path: new URL(req.url()).pathname,
      body,
    });
    if (state.delayed) await gate;
    if (state.failWrite)
      return route.fulfill({ status: state.failWrite, json: {} });
    if (
      !state.review ||
      body.revision !== state.review.revision ||
      body.nextPrescriptionRevision !== next.revision
    )
      return route.fulfill({ status: 409, json: {} });
    if (
      !state.review.professionalNotes?.trim() ||
      !state.review.patientMessage.es?.trim() ||
      !state.review.patientMessage.en?.trim() ||
      !state.review.criticalAlertsConfirmed ||
      (state.review.aiDraft &&
        (state.review.aiDraft as { status?: string }).status !==
          "insufficient" &&
        !state.review.aiDraftConfirmed) ||
      body.nextPrescriptionId !== nextPlanId ||
      next.cycle!.state !== "en_aprobacion"
    )
      return route.fulfill({ status: 422, json: {} });
    if (!state.review.publishedAt) {
      state.review.publishedAt = "2026-11-14T17:00:00Z";
      state.review.revision++;
      state.publishedPlans++;
      state.notifications++;
      next.cycle!.state = "aprobado";
      next.cycle!.startDate = "2026-11-14";
      next.cycle!.endDate = "2026-12-13";
      next.cycle!.publishedVersionId = nextPlanId;
      next.publishedCycle = structuredClone(next.cycle);
    }
    return route.fulfill(
      state.lostPublishResponse
        ? { status: 503, json: {} }
        : { contentType: "application/json", json: withUrls() },
    );
  });
  return { ...base, closingState: state, next, aiState };
}
