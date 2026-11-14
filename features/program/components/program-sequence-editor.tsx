"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  LockKeyhole,
  Repeat2,
  Save,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/providers/i18n-provider";
import { MediaLibraryPicker } from "@/features/media/components/media-library-picker";
import { getMediaCategoryMeta } from "@/features/media/components/media-meta";
import {
  fetchMediaItems,
  hasMediaFile,
} from "@/features/media/services/media-service";
import type { MediaItem } from "@/features/media/types";
import type { ProgramTemplate, WeeklyDayTask } from "../types";
import {
  replaceWeekdayTasks,
  WEEKDAY_LABELS,
} from "../services/program-templates-service";
import {
  autocompletePodcasts,
  changedSequenceWeeks,
  mergeSequenceWeek,
  podcastWeekPayload,
  resolvePodcastSequence,
  sequenceStats,
  swapPodcastDays,
  type PodcastSequence,
} from "../services/program-sequence";

interface Props {
  template: ProgramTemplate;
  canEdit: boolean;
  onSaved: (days: WeeklyDayTask[]) => void;
  onBusyChange: (busy: boolean) => void;
  initialDay?: number;
}

/** El catálogo completo se pagina; nunca se interpreta una página incompleta como biblioteca vacía. */
async function publishedPodcasts(signal: AbortSignal): Promise<MediaItem[]> {
  const items = new Map<string, MediaItem>();
  let page = 1;
  let pages = 1;
  do {
    const result = await fetchMediaItems(
      page,
      100,
      {
        mediaType: "Podcast",
        status: "Published",
        sortBy: "sortOrder",
        sortDirection: "asc",
      },
      signal,
    );
    for (const item of result.data)
      if (item.mediaType === "Podcast" && item.status === "Published")
        items.set(item.id, item);
    pages = result.totalPages;
    page += 1;
  } while (page <= pages);
  return [...items.values()].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

export function ProgramSequenceEditor(props: Props) {
  const t = useT();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    media: MediaItem[] | null;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void publishedPodcasts(controller.signal)
      .then((media) => {
        if (!controller.signal.aborted) setResult({ attempt, media });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ attempt, media: null });
      });
    return () => controller.abort();
  }, [attempt]);
  if (result?.attempt !== attempt)
    return (
      <div
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]"
        aria-busy="true"
      >
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  if (!result.media)
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-destructive p-4"
      >
        <p>{t("No pudimos cargar la biblioteca")}</p>
        <Button
          variant="outline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t("Reintentar")}
        </Button>
      </div>
    );
  return <SequenceWorkspace {...props} media={result.media} />;
}

function SequenceWorkspace({
  template,
  media,
  canEdit,
  onSaved,
  onBusyChange,
  initialDay = 1,
}: Props & { media: MediaItem[] }) {
  const t = useT();
  const [rows, setRows] = useState(template.days);
  const [baseline, setBaseline] = useState(() =>
    resolvePodcastSequence(template.days),
  );
  const [sequence, setSequence] = useState(() =>
    resolvePodcastSequence(template.days),
  );
  const [undo, setUndo] = useState<PodcastSequence | null>(null);
  const [selected, setSelected] = useState(
    Math.max(0, Math.min(82, initialDay - 1)),
  );
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const dragFrom = useRef<number | null>(null);
  const mediaById = new Map(media.map((item) => [item.id, item]));
  const availableMedia = media.filter(hasMediaFile);
  const ids = new Set(availableMedia.map((item) => item.id));
  const stats = sequenceStats(sequence, ids);
  const dirtyWeeks = changedSequenceWeeks(baseline, sequence);
  const editable = canEdit && template.status === "Draft";
  const selectedMedia = mediaById.get(sequence[selected] ?? "");

  const change = (next: PodcastSequence) => {
    if (!editable || savingRef.current || next === sequence) return;
    setUndo([...sequence]);
    setSequence(next);
    setError(null);
    setMessage(null);
  };
  const selectDay = (index: number) => {
    if (savingRef.current) return;
    if (swapFrom !== null) {
      change(swapPodcastDays(sequence, swapFrom, index));
      setSwapFrom(null);
    }
    setSelected(index);
  };
  const autocomplete = (rebuild: boolean) => {
    const next = autocompletePodcasts(
      sequence,
      availableMedia.map((item) => item.id),
      rebuild,
    );
    if (!next) {
      setError(
        t(
          "No se pudo completar respetando 42 días entre repeticiones. Revisa la secuencia o publica más podcasts.",
        ),
      );
      return;
    }
    change(next);
  };
  const save = async () => {
    if (savingRef.current || !editable || !dirtyWeeks.length) return;
    savingRef.current = true;
    setSaving(true);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    setSwapFrom(null);
    let persistedRows = rows;
    let persistedBaseline = [...baseline];
    try {
      for (const week of dirtyWeeks) {
        const response = await replaceWeekdayTasks(
          template.id,
          podcastWeekPayload(persistedRows, sequence, week),
          week,
        );
        persistedRows = mergeSequenceWeek(persistedRows, response, week);
        const start = (week - 1) * 7;
        const confirmed = resolvePodcastSequence(persistedRows);
        persistedBaseline = persistedBaseline.map((id, index) =>
          index >= start && index < Math.min(start + 7, 83)
            ? confirmed[index]
            : id,
        );
        // Confirmar cada semana permite reintentar un fallo parcial sin repetir las ya guardadas.
        setRows(persistedRows);
        setBaseline([...persistedBaseline]);
        onSaved(persistedRows);
      }
      setUndo(null);
      setMessage(t("Cambios guardados"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(
              "No se pudo guardar la secuencia. Los cambios pendientes se conservan.",
            ),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("12 semanas, 83 días")}
        </p>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={saving || !undo}
                onClick={() => {
                  if (undo) {
                    setSequence(undo);
                    setUndo(null);
                    setSwapFrom(null);
                    setError(null);
                    setMessage(null);
                  }
                }}
              >
                {t("Deshacer")}
              </Button>
              <Button
                className="min-h-11"
                disabled={saving || !dirtyWeeks.length}
                onClick={() => void save()}
              >
                <Save aria-hidden="true" />
                {saving ? t("Guardando...") : t("Guardar borrador")}
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      )}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 rounded-2xl border border-border bg-card p-3 sm:p-5">
          <h3 className="mb-3 text-lg font-semibold">
            {t("Secuencia de podcasts")}
          </h3>
          <p
            id="sequence-instructions"
            className="mb-4 text-xs text-muted-foreground"
          >
            {editable
              ? t(
                  "Arrastra para intercambiar podcasts o selecciona un día y usa Intercambiar.",
                )
              : t("Consulta el contenido de cada día de esta versión.")}
          </p>
          <div
            role="region"
            aria-label={t("Secuencia de podcasts")}
            tabIndex={0}
            className="max-w-full overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            <table className="w-full min-w-[920px] border-separate border-spacing-1.5 text-left text-xs">
              <caption className="sr-only">{t("12 semanas, 83 días")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("Semana")}</th>
                  {WEEKDAY_LABELS.map((label) => (
                    <th
                      scope="col"
                      key={label}
                      className="p-1 text-center text-muted-foreground"
                    >
                      {t(label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }, (_, weekIndex) => (
                  <tr key={weekIndex}>
                    <th scope="row" className="w-24 pr-2 font-semibold">
                      {t("Semana {week}", { week: String(weekIndex + 1) })}
                      <span className="mt-1 block whitespace-nowrap font-mono text-[10px] font-normal text-muted-foreground">
                        {weekIndex * 7 + 1}–{Math.min(weekIndex * 7 + 7, 83)}
                      </span>
                    </th>
                    {Array.from({ length: 7 }, (_, weekday) => {
                      const index = weekIndex * 7 + weekday;
                      if (index === 83)
                        return (
                          <td key={weekday}>
                            <button
                              type="button"
                              disabled
                              aria-label={t("Día 84: no existe")}
                              className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted text-muted-foreground"
                            >
                              <LockKeyhole
                                className="size-4"
                                aria-hidden="true"
                              />
                              {t("No existe")}
                            </button>
                          </td>
                        );
                      const item = mediaById.get(sequence[index] ?? "");
                      const validFile = item && hasMediaFile(item);
                      const repeated =
                        item && sequence.indexOf(item.id) < index;
                      return (
                        <td key={weekday}>
                          <button
                            type="button"
                            data-sequence-day={index + 1}
                            title={item?.title}
                            aria-label={t("Día {day}", {
                              day: String(index + 1),
                            })}
                            aria-pressed={selected === index}
                            aria-describedby="sequence-instructions"
                            disabled={saving}
                            draggable={editable && Boolean(item) && !saving}
                            onDragStart={(event) => {
                              dragFrom.current = index;
                              event.dataTransfer.setData(
                                "application/x-copp-sequence-day",
                                String(index),
                              );
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              dragFrom.current = null;
                            }}
                            onDragOver={(event) => {
                              if (
                                editable &&
                                !saving &&
                                dragFrom.current !== null
                              ) {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const from = Number(
                                event.dataTransfer.getData(
                                  "application/x-copp-sequence-day",
                                ),
                              );
                              if (
                                editable &&
                                dragFrom.current !== null &&
                                from === dragFrom.current
                              ) {
                                change(swapPodcastDays(sequence, from, index));
                                setSelected(index);
                              }
                              dragFrom.current = null;
                            }}
                            onClick={() => selectDay(index)}
                            className={`flex min-h-20 w-full min-w-24 flex-col gap-1 rounded-xl border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 ${selected === index ? "border-primary bg-primary-soft ring-1 ring-primary" : validFile ? "border-border bg-background hover:bg-muted" : "border-destructive/30 bg-destructive-soft text-destructive"}`}
                          >
                            <span className="flex items-center justify-between gap-1 font-semibold">
                              {t("Día {day}", { day: String(index + 1) })}
                              {repeated && (
                                <Repeat2
                                  className="size-3.5 shrink-0"
                                  aria-label={t("Repeticiones")}
                                />
                              )}
                            </span>
                            <span className="line-clamp-2 text-[11px]">
                              {item?.title ??
                                (sequence[index]
                                  ? t("Podcast no disponible")
                                  : t("Vacío"))}
                            </span>
                            {item && !validFile && (
                              <span className="text-[11px] font-semibold text-destructive">
                                {t("Sin archivo")}
                              </span>
                            )}
                            {item && (
                              <span
                                className={`mt-auto h-1 w-7 rounded-full ${getMediaCategoryMeta(item.category).tone}`}
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <section
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
            aria-label={t("Estado de la secuencia")}
          >
            <h3 className="text-lg font-semibold">
              {t("Estado de la secuencia")}
            </h3>
            <dl className="flex flex-col gap-3 text-sm" aria-live="polite">
              <div className="flex justify-between gap-3">
                <dt>{t("Días con podcast")}</dt>
                <dd className="font-mono font-semibold">
                  {stats.assigned} / 83
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t("Huecos")}</dt>
                <dd>
                  <Badge
                    variant="secondary"
                    className={
                      stats.gaps
                        ? "bg-destructive-soft text-destructive"
                        : "bg-success-soft text-success-soft-foreground"
                    }
                  >
                    {stats.gaps}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t("Días que repiten")}</dt>
                <dd>
                  <Badge variant="secondary">{stats.repeats}</Badge>
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {t(
                "El autocompletado recorre el catálogo en orden y no repite podcasts antes de 42 días.",
              )}
            </p>
            {editable && (
              <>
                <Button
                  className="min-h-11 whitespace-normal"
                  disabled={saving || availableMedia.length < 42 || !stats.gaps}
                  onClick={() => autocomplete(false)}
                >
                  <WandSparkles aria-hidden="true" />
                  {t("Autocompletar huecos")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 whitespace-normal"
                  disabled={saving || availableMedia.length < 42}
                  onClick={() => autocomplete(true)}
                >
                  {t("Rehacer toda la secuencia")}
                </Button>
                {availableMedia.length < 42 && (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Se necesitan al menos 42 podcasts publicados para autocompletar.",
                    )}
                  </p>
                )}
              </>
            )}
          </section>
          <section
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
            aria-label={t("Día {day}", { day: String(selected + 1) })}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">
                {t("Día {day}", { day: String(selected + 1) })}
              </h3>
              <Badge variant="secondary">
                {t("Semana {week}", {
                  week: String(Math.floor(selected / 7) + 1),
                })}
              </Badge>
            </div>
            <p className="break-words text-sm">
              {selectedMedia?.title ??
                (sequence[selected] ? t("Podcast no disponible") : t("Vacío"))}
            </p>
            {selectedMedia && !hasMediaFile(selectedMedia) && (
              <p role="status" className="text-sm text-destructive">
                {t("Sin archivo. Este día se cuenta como hueco.")}
              </p>
            )}
            {editable && (
              <>
                <Button
                  className="min-h-11"
                  disabled={saving}
                  onClick={() => {
                    setSwapFrom(null);
                    setPickerOpen(true);
                  }}
                >
                  {t("Elegir de la biblioteca")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={saving}
                  onClick={() =>
                    setSwapFrom(swapFrom === null ? selected : null)
                  }
                  aria-pressed={swapFrom !== null}
                >
                  <ArrowLeftRight aria-hidden="true" />
                  {t("Intercambiar")}
                </Button>
                {swapFrom !== null && (
                  <p role="status" className="text-sm text-primary">
                    {t("Selecciona otro día para intercambiar los podcasts.")}
                  </p>
                )}
                <Button
                  variant="ghost"
                  className="min-h-11"
                  disabled={saving || !sequence[selected]}
                  onClick={() => {
                    const next = [...sequence];
                    next[selected] = null;
                    change(next);
                  }}
                >
                  {t("Quitar")}
                </Button>
              </>
            )}
          </section>
        </aside>
      </div>
      <MediaLibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        destino="programa"
        selectedIds={sequence[selected] ? [sequence[selected]!] : []}
        onConfirm={(items) => {
          const item = items[0];
          if (item?.mediaType === "Podcast" && item.status === "Published") {
            const next = [...sequence];
            next[selected] = item.id;
            change(next);
          }
          setPickerOpen(false);
        }}
      />
    </section>
  );
}
