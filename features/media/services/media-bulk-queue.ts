import type { MediaCategory, MediaBulkResult } from "../types";

export type { MediaBulkResult } from "../types";

/** Estados locales de preparación y los tres resultados de la tarea backend 1.13. */
export type MediaBulkState = "pendiente" | "borrador" | "publicado" | "error";

export interface MediaBulkRow {
  /** Identidad local: dos archivos con el mismo nombre siguen siendo filas distintas. */
  key: string;
  file: File;
  title: string;
  author: string;
  category: MediaCategory;
  state: MediaBulkState;
  mediaId: string | null;
  error: string | null;
  durationSecs: number | null;
  progress: number | null;
  dirty: boolean;
}

export function mediaTitleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createMediaBulkRows(files: readonly File[]): MediaBulkRow[] {
  return files.map((file) => ({
    key: crypto.randomUUID(),
    file,
    title: mediaTitleFromFilename(file.name),
    author: "",
    category: "Nutricion",
    state: "pendiente",
    mediaId: null,
    error: null,
    durationSecs: null,
    progress: null,
    dirty: false,
  }));
}

export function mediaBulkResult(row: MediaBulkRow): MediaBulkResult | null {
  if (row.state === "pendiente") return null;
  return {
    nombre: row.file.name,
    estado: row.state,
    ...(row.error ? { error: row.error } : {}),
  };
}

/** Crea las filas pendientes o fallidas y permite guardar metadatos editados de borradores. */
export function mediaBulkDraftCandidates(
  rows: readonly MediaBulkRow[],
): MediaBulkRow[] {
  return rows.filter(
    (row) =>
      (!row.mediaId && (row.state === "pendiente" || row.state === "error")) ||
      (row.dirty && row.state !== "publicado"),
  );
}

/** Un fallo de publicación conserva su id para reintentar sin duplicar el borrador. */
export function mediaBulkPublishCandidates(
  rows: readonly MediaBulkRow[],
): MediaBulkRow[] {
  return rows.filter(
    (row) => row.mediaId && (row.state === "borrador" || row.state === "error"),
  );
}

export interface MediaBulkFileResult extends MediaBulkResult {
  mediaId?: string | null;
}

/** El backend conserva el orden: no agrupar por nombre, porque puede repetirse. */
export function applyMediaBulkResults(
  rows: readonly MediaBulkRow[],
  results: readonly MediaBulkFileResult[],
  fallback: string,
): MediaBulkRow[] {
  return rows.map((row, index) => {
    const result = Array.isArray(results) ? results[index] : undefined;
    if (
      !result ||
      result.nombre !== row.file.name ||
      !["borrador", "publicado", "error"].includes(result.estado) ||
      (result.estado !== "error" && !result.mediaId)
    ) {
      return { ...row, state: "error", error: fallback };
    }
    return {
      ...row,
      state: result.estado,
      mediaId: result.mediaId ?? row.mediaId,
      error: result.estado === "error" ? result.error || fallback : null,
      dirty: result.estado === "error" ? row.dirty : false,
    };
  });
}

/** El contrato admite hasta 100 filas por petición; conserva resultados entre lotes. */
export async function runMediaBulkBatches(
  rows: readonly MediaBulkRow[],
  operation: (batch: MediaBulkRow[]) => Promise<MediaBulkRow[]>,
  onResult: (row: MediaBulkRow) => void,
  signal: AbortSignal,
  fallback: string,
) {
  for (let start = 0; start < rows.length; start += 100) {
    signal.throwIfAborted();
    const batch = rows.slice(start, start + 100);
    let results: MediaBulkRow[];
    try {
      results = await operation(batch);
    } catch (error) {
      signal.throwIfAborted();
      results = batch.map((row) => ({
        ...row,
        state: "error" as const,
        error: error instanceof Error ? error.message : fallback,
      }));
    }
    signal.throwIfAborted();
    results.forEach(onResult);
  }
}
