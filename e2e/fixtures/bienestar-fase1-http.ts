import type { Page, Route } from "@playwright/test";
import type { MediaInput, MediaItem } from "../../features/media/types";
import type { ProgramTemplate } from "../../features/program/types";
import type { PatientPodcastAssignment } from "../../features/patients/services/patient-podcast-assignment-service";
import { mockPatientsHttp, patientWorkspaceUserId } from "./patients-http";

const reply = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType:
      status === 422 ? "application/problem+json" : "application/json",
    body: JSON.stringify(body),
  });

/** Cada test recibe almacenes nuevos. El arnés base intercepta también las APIs desconocidas. */
export async function mockBienestarPhase1(page: Page) {
  const permissions = [
    "Program.View",
    "Program.Edit",
    "Patients.View",
    "Media.View",
    "Media.Create",
    "Media.Edit",
    "Media.Publish",
    "Media.Archive",
  ];
  const base = await mockPatientsHttp(page, { permissions });
  await page.route("**/api/auth/me", (route) =>
    reply(route, {
      id: patientWorkspaceUserId,
      email: "phase1@example.invalid",
      firstName: "Ana",
      lastName: "QA",
      roles: ["Admin"],
      permissions,
    }),
  );
  const template: ProgramTemplate = {
    id: "00000000-0000-4000-8000-000000000701",
    code: "fase1-83",
    name: "Programa de bienestar QA",
    description: "Plantilla sintética de fase 1",
    totalWeeks: 12,
    status: "Draft",
    version: 1,
    createdAt: "2026-11-14",
    createdBy: null,
    updatedBy: null,
    updatedAt: null,
    publishedAt: null,
    days: [],
  };
  const podcast: MediaItem = {
    id: "00000000-0000-4000-8000-000000000801",
    title: "Respiración consciente QA",
    author: "Equipo QA",
    description: null,
    category: "Habitos",
    mediaType: "Podcast",
    status: "Published",
    storageKey: "media/phase1/original.wav",
    thumbnailKey: null,
    contentType: "audio/wav",
    fileSizeBytes: 16044,
    durationSecs: 1,
    sortOrder: 1,
    day: 0,
    month: 0,
    publishedAt: "2026-11-14",
    createdAt: "2026-11-14",
    createdBy: null,
    updatedAt: null,
  };
  const replacement: MediaItem = {
    ...podcast,
    id: "00000000-0000-4000-8000-000000000802",
    title: "Descanso reparador QA",
    storageKey: "media/phase1/replacement.wav",
  };
  const impact = {
    pacientesQueCambian: 23,
    conPersonalizacionesFuturas: 7,
    semanasOmitidasIniciadas: 41,
  };
  const retirementImpact = { pacientes: 23, plantillas: 2 };
  const gaps = [
    { day: 24, weekNumber: 4, weekday: 3, taskCode: "podcast" },
    { day: 24, weekNumber: 4, weekday: 3, taskCode: "ejercicio" },
    { day: 83, weekNumber: 12, weekday: 6, taskCode: "nut" },
  ];
  const state = {
    hasGaps: false,
    previewRequests: [] as string[],
    publications: [] as string[],
    assignments: [] as PatientPodcastAssignment[],
    retirements: [] as { id: string; replacementMediaId: string | null }[],
    uploads: [] as string[],
    uploadIntents: [] as string[],
    draftBatches: [] as (MediaInput & { nombre: string })[][],
    failedDraft: false,
  };
  const drafts = new Map<string, MediaItem>();
  await page.route("**/api/v1/program/templates**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const root = "/api/v1/program/templates";
    if (
      url.pathname === `${root}/${template.id}/publish` &&
      request.method() === "POST"
    ) {
      if (url.searchParams.get("preview") === "true") {
        state.previewRequests.push(request.url());
        return reply(route, impact);
      }
      state.publications.push(request.url());
      if (state.hasGaps)
        return reply(
          route,
          {
            status: 422,
            title: "Unprocessable Entity",
            detail: "TEMPLATE_CONTENT_GAPS: completa los días indicados.",
            gaps,
          },
          422,
        );
      template.status = "Active";
      template.version++;
      return reply(route, template);
    }
    if (request.method() === "GET" && url.pathname === `${root}/${template.id}`)
      return reply(route, template);
    if (request.method() === "GET" && url.pathname === root)
      return reply(route, {
        data: [template],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    return route.fallback();
  });
  await page.route(
    "**/api/v1/program/content/bulk-assign-patients",
    (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const input = route.request().postDataJSON() as PatientPodcastAssignment;
      state.assignments.push(input);
      return reply(route, {
        aplicadas: input.patientIds.length - 1,
        omitidasSemanaIniciada: 1,
        omitidasSinAlcance: [input.patientIds.at(-1)],
      });
    },
  );
  await page.route("**/api/v1/storage/**", (route) => {
    if (route.request().method() === "PUT") {
      state.uploads.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 204 });
    }
    if (new URL(route.request().url()).pathname === "/api/v1/storage/sign")
      return reply(route, {
        url: `${new URL(page.url()).origin}/qa-phase1-audio`,
      });
    return route.fallback();
  });
  await page.route("**/qa-phase1-audio", (route) =>
    route.fulfill({
      contentType: "audio/wav",
      body: phase1Audio("preview.wav").buffer,
    }),
  );
  await page.route("**/api/v1/media**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const root = "/api/v1/media";
    const method = request.method();
    if (url.pathname === `${root}/upload-intent` && method === "POST") {
      state.uploadIntents.push(request.postDataJSON().fileName);
      const storageKey = `media/phase1/upload-${state.uploadIntents.length}.wav`;
      return reply(route, {
        storageKey,
        presignedUrl: `${new URL(page.url()).origin}/api/v1/storage/${storageKey}`,
        expiresInSeconds: 900,
      });
    }
    if (url.pathname === `${root}/bulk/drafts` && method === "POST") {
      const { files } = request.postDataJSON() as {
        files: (MediaInput & { nombre: string })[];
      };
      state.draftBatches.push(files);
      return reply(
        route,
        files.map((file) => {
          if (file.nombre === "episodio_fallido.wav" && !state.failedDraft) {
            state.failedDraft = true;
            return {
              nombre: file.nombre,
              estado: "error",
              error: "No se pudo registrar este audio de prueba.",
            };
          }
          const existing = [...drafts.values()].find(
            (item) => item.storageKey === file.storageKey,
          );
          if (existing)
            return {
              nombre: file.nombre,
              estado: "borrador",
              mediaId: existing.id,
            };
          const item: MediaItem = {
            ...podcast,
            ...file,
            id: `00000000-0000-4000-8000-${String(drafts.size + 901).padStart(12, "0")}`,
            status: "Draft",
            publishedAt: null,
          };
          drafts.set(item.id, item);
          return { nombre: file.nombre, estado: "borrador", mediaId: item.id };
        }),
      );
    }
    if (
      url.pathname === `${root}/${podcast.id}/retirement-impact` &&
      method === "GET"
    )
      return reply(route, retirementImpact);
    if (url.pathname === `${root}/${podcast.id}/references` && method === "GET")
      return reply(route, {
        mediaId: podcast.id,
        totalReferences: 2,
        templateReferences: [
          {
            templateId: template.id,
            templateName: template.name,
            weekday: 1,
            points: 100,
          },
        ],
        enrollmentReferences: [],
        routineReferences: [],
      });
    if (
      url.pathname === `${root}/${podcast.id}/unpublish` &&
      method === "POST"
    ) {
      const replacementMediaId =
        request.postDataJSON()?.replacementMediaId ?? null;
      state.retirements.push({ id: podcast.id, replacementMediaId });
      if (replacementMediaId !== replacement.id)
        return reply(
          route,
          {
            detail: "MEDIA_REPLACEMENT_REQUIRED: selecciona un sustituto.",
            impact: retirementImpact,
          },
          409,
        );
      podcast.status = "Draft";
      return reply(route, { ...podcast, retirementImpact });
    }
    if (method === "GET" && url.pathname === `${root}/${podcast.id}`)
      return reply(route, podcast);
    if (method === "GET" && url.pathname === `${root}/${replacement.id}`)
      return reply(route, replacement);
    const draft = drafts.get(url.pathname.slice(root.length + 1));
    if (method === "GET" && draft) return reply(route, draft);
    if (method === "GET" && url.pathname === root) {
      const items = [podcast, replacement].filter(
        (item) =>
          !url.searchParams.get("status") ||
          item.status === url.searchParams.get("status"),
      );
      return reply(route, {
        items,
        totalCount: items.length,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    }
    return route.fallback();
  });
  return {
    ...base,
    state,
    template,
    podcast,
    replacement,
    impact,
    retirementImpact,
    drafts,
  };
}

/** Audio PCM real para comprobar carga y duración sin archivos externos. */
export function phase1Audio(name: string) {
  const buffer = Buffer.alloc(44 + 16000);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(16000, 40);
  return { name, mimeType: "audio/wav", buffer };
}
