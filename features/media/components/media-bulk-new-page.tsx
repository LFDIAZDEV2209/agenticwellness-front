"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/providers/i18n-provider";
import { useAppContext } from "@/providers/context-provider";
import {
  MediaBulkUpload,
  type MediaBulkUploadProps,
} from "./media-bulk-upload";
import { getMediaItemById, updateMediaItem } from "../services/media-service";
import {
  detectMediaMetadata,
  resolveStorageKeys,
} from "../services/upload-service";
import {
  applyMediaBulkResults,
  type MediaBulkRow,
} from "../services/media-bulk-queue";
import {
  createBulkMediaDrafts,
  publishBulkMedia,
  type MediaBulkFile,
} from "../services/media-bulk-service";
import type { MediaInput } from "../types";

/** Archivos al storage existente y registro/publicación mediante el contrato real de 1.13. */
export function MediaBulkNewPage() {
  const t = useT();
  const router = useRouter();
  const { can } = useAppContext();
  const uploaded = useRef(new Map<string, MediaInput>());

  const failed = (row: MediaBulkRow, error: unknown): MediaBulkRow => ({
    ...row,
    state: "error",
    error:
      error instanceof Error ? error.message : t("No se pudo crear el medio."),
  });

  const saveMetadata = async (
    row: MediaBulkRow,
    signal: AbortSignal,
  ): Promise<MediaBulkRow> => {
    signal.throwIfAborted();
    const current = await getMediaItemById(row.mediaId!);
    signal.throwIfAborted();
    // Una publicación cuya respuesta se perdió jamás se despublica al reintentar.
    if (current.status === "Published")
      return {
        ...row,
        title: current.title,
        author: current.author,
        category: current.category,
        state: "publicado",
        dirty: false,
        error: null,
      };
    if (current.status !== "Draft")
      throw new Error(
        t("El medio ya no es un borrador. Actualiza la biblioteca."),
      );
    if (
      current.title !== row.title.trim() ||
      current.author !== row.author.trim() ||
      current.category !== row.category
    ) {
      if (!can("Media.Edit"))
        throw new Error(t("No tienes permiso para editar este medio."));
      // Conservar también origen, etiquetas, capítulos y calendario heredado.
      await updateMediaItem(current.id, {
        ...current,
        title: row.title.trim(),
        author: row.author.trim(),
        category: row.category,
      });
      signal.throwIfAborted();
    }
    return { ...row, state: "borrador", dirty: false, error: null };
  };

  const createDrafts: MediaBulkUploadProps["createDrafts"] = async (
    rows,
    signal,
    onProgress,
  ) => {
    const results: MediaBulkRow[] = [];
    const pending: { row: MediaBulkRow; file: MediaBulkFile }[] = [];
    for (const row of rows) {
      signal.throwIfAborted();
      try {
        if (!row.title.trim()) throw new Error(t("El título es obligatorio."));
        if (!row.author.trim()) throw new Error(t("El autor es obligatorio."));
        if (row.mediaId) {
          results.push(await saveMetadata(row, signal));
          continue;
        }
        if (row.file.size > 200 * 1024 * 1024)
          throw new Error(t("El archivo supera 200 MB."));
        if (
          !row.file.type.startsWith("audio/") &&
          !/\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(row.file.name)
        ) {
          throw new Error(
            t("Selecciona archivos de audio para la biblioteca de podcasts."),
          );
        }
        let input = uploaded.current.get(row.key);
        if (!input) {
          const metadata = await detectMediaMetadata(row.file);
          signal.throwIfAborted();
          onProgress(row.key, { durationSecs: metadata.durationSecs });
          input = await resolveStorageKeys(
            {
              title: row.title.trim(),
              author: row.author.trim(),
              description: null,
              category: row.category,
              mediaType: "Podcast",
              status: "Draft",
              sortOrder: 0,
              day: 0,
              month: 0,
              storageKey: "",
              thumbnailKey: null,
              contentType: metadata.contentType,
              fileSizeBytes: row.file.size,
              durationSecs: metadata.durationSecs,
            },
            row.file,
            undefined,
            (percent) => onProgress(row.key, { percent }),
          );
          // Reutilizar la clave incluso si se pierde la respuesta del registro de lote.
          uploaded.current.set(row.key, input);
        }
        signal.throwIfAborted();
        pending.push({
          row,
          file: {
            nombre: row.file.name,
            storageKey: input.storageKey,
            title: row.title.trim(),
            author: row.author.trim(),
            category: row.category,
            contentType: input.contentType ?? null,
            fileSizeBytes: input.fileSizeBytes ?? null,
            durationSecs: input.durationSecs ?? null,
            thumbnailKey: input.thumbnailKey ?? null,
          },
        });
      } catch (error) {
        signal.throwIfAborted();
        results.push(failed(row, error));
      }
    }
    if (pending.length) {
      try {
        const response = await createBulkMediaDrafts(
          pending.map((entry) => entry.file),
          signal,
        );
        const registered = applyMediaBulkResults(
          pending.map((entry) => entry.row),
          response,
          t("No se pudo crear el medio."),
        );
        for (const row of registered) {
          signal.throwIfAborted();
          const original = uploaded.current.get(row.key);
          // Existing() de 1.13 conserva los metadatos del primer registro.
          // Reconciliar una edición realizada después de una respuesta perdida.
          if (
            row.state === "borrador" &&
            original &&
            (original.title !== row.title.trim() ||
              original.author !== row.author.trim() ||
              original.category !== row.category)
          ) {
            try {
              results.push(await saveMetadata(row, signal));
            } catch (error) {
              signal.throwIfAborted();
              results.push(failed({ ...row, dirty: true }, error));
            }
          } else results.push(row);
        }
      } catch (error) {
        signal.throwIfAborted();
        results.push(...pending.map((entry) => failed(entry.row, error)));
      }
    }
    return results;
  };

  const publishDrafts: MediaBulkUploadProps["publishDrafts"] = async (
    rows,
    signal,
  ) => {
    const results: MediaBulkRow[] = [];
    const ready: MediaBulkRow[] = [];
    for (const row of rows) {
      signal.throwIfAborted();
      try {
        const saved = await saveMetadata(row, signal);
        if (saved.state === "publicado") results.push(saved);
        else ready.push(saved);
      } catch (error) {
        signal.throwIfAborted();
        results.push(failed(row, error));
      }
    }
    if (ready.length) {
      try {
        const response = await publishBulkMedia(
          ready.map((row) => ({
            nombre: row.file.name,
            mediaId: row.mediaId!,
          })),
          signal,
        );
        results.push(
          ...applyMediaBulkResults(
            ready,
            response,
            t("No se pudo publicar el medio."),
          ),
        );
      } catch (error) {
        signal.throwIfAborted();
        results.push(...ready.map((row) => failed(row, error)));
      }
    }
    return results;
  };

  return (
    <div className="p-4 sm:p-6">
      <section className="mx-auto flex min-w-0 max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("Subir podcasts")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Cada archivo queda como borrador con el título tomado del nombre. Complétalos aquí y publícalos juntos.",
              )}
            </p>
          </div>
          <Link
            href="/media"
            className={buttonVariants({
              variant: "ghost",
              className: "min-h-11 min-w-11 shrink-0",
            })}
          >
            <X aria-hidden="true" />
            <span className="sr-only">{t("Volver a medios")}</span>
          </Link>
        </header>
        <div className="p-5 sm:p-6">
          <MediaBulkUpload
            createDrafts={createDrafts}
            publishDrafts={publishDrafts}
            onCancel={() => router.push("/media")}
          />
        </div>
      </section>
    </div>
  );
}
