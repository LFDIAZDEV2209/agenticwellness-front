import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import type { MediaCategory } from "../types";
import type { MediaBulkFileResult } from "./media-bulk-queue";

/** Contrato de BulkMediaFile (backend 1.13, a96bb57). El archivo ya está en storage. */
export interface MediaBulkFile {
  nombre: string;
  storageKey: string;
  contentType: string | null;
  fileSizeBytes: number | null;
  durationSecs: number | null;
  title: string;
  author: string;
  category: MediaCategory;
  thumbnailKey: string | null;
}

const path = `${env.apiUrl}/api/v1/media/bulk`;

export function createBulkMediaDrafts(
  files: MediaBulkFile[],
  signal: AbortSignal,
) {
  return apiFetch<MediaBulkFileResult[]>(`${path}/drafts`, {
    method: "POST",
    body: JSON.stringify({ files }),
    signal,
  });
}

export function publishBulkMedia(
  files: { nombre: string; mediaId: string }[],
  signal: AbortSignal,
) {
  return apiFetch<MediaBulkFileResult[]>(`${path}/publish`, {
    method: "POST",
    body: JSON.stringify({ files }),
    signal,
  });
}
