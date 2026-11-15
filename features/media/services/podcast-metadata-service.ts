import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import type { PodcastMetadataInput, PodcastMetadataResult } from "../types/podcast-metadata";

const categories = new Set([
  "Biologia", "Nutricion", "Psicologia", "CrecimientoPersonal", "Habitos",
  "SaludFisica", "BienestarEmocional", "Mindfulness", "Motivacion",
]);
export const isEditorialText = (value: string) => !/https?:\/\/|<[^>]+>/i.test(value);

/** Valida la frontera de red antes de ofrecer valores al editor. */
function validResult(value: unknown): value is PodcastMetadataResult {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (r.isEstimate !== true) return false;
  if (r.status === "unavailable") return r.draft === null && r.model === null && r.generatedAt === null;
  if (r.status !== "ok" || !r.draft || typeof r.draft !== "object") return false;
  const d = r.draft as Record<string, unknown>;
  return typeof d.description === "string" && Boolean(d.description.trim()) && d.description.length <= 2000
    && isEditorialText(d.description) && typeof d.category === "string" && categories.has(d.category)
    && Array.isArray(d.tags) && d.tags.length <= 32
    && d.tags.every(tag => typeof tag === "string" && Boolean(tag.trim()) && tag.length <= 64 && isEditorialText(tag))
    && (r.model === null || typeof r.model === "string" && Boolean(r.model.trim()) && r.model.length <= 200)
    && typeof r.generatedAt === "string" && /(?:Z|\+00:00)$/.test(r.generatedAt) && Number.isFinite(Date.parse(r.generatedAt));
}

export async function suggestPodcastMetadata(input: PodcastMetadataInput, signal: AbortSignal): Promise<PodcastMetadataResult> {
  const result = await apiFetch<unknown>(`${env.apiUrl}/api/v1/media/podcast-metadata`, {
    method: "POST", signal, timeoutMs: 30_000,
    body: JSON.stringify({ title: input.title.trim(), language: input.language, context: input.context.trim() }),
  });
  if (!validResult(result)) throw new Error("Invalid podcast metadata response");
  return result;
}
