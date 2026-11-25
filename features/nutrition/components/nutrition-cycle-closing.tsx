"use client";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LockKeyhole, Upload, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppContext } from "@/providers/context-provider";
import { useI18n, useT } from "@/providers/i18n-provider";
import { useNutritionResource } from "../hooks/use-nutrition-resource";
import { nutritionIssue } from "../services/nutrition-service";
import {
  fetchCycleClosing,
  saveCycleClosing,
  publishCycleClosing,
  uploadCycleAttachment,
  deleteCycleAttachment,
  cycleAttachmentUrl,
  generateCycleAiDraft,
  parseCycleAiDraft,
  cycleAiRequiresConfirmation,
  type CycleClosing,
  type CycleClosingFields,
  type CycleClosingAttachment,
} from "../services/nutrition-cycle-closing-service";
import {
  NutritionNextCyclePlan,
  type ClosingNextPlan,
} from "./nutrition-next-cycle-plan";
import type { CycleAdherence } from "../types/nutrition-cycle-review";
import type { NutritionServiceIssue } from "../types/nutrition";
import { NutritionCycleAiPanel } from "./nutrition-cycle-ai-panel";

interface Props {
  patientId: string;
  cycleId: string;
  sourceId: string;
  period: CycleAdherence;
  today: string;
  timezone: string;
  section: (index: number, body: ReactNode) => ReactNode;
  onLock: (locked: boolean) => void;
}
const fieldsOf = (review: CycleClosing | null): CycleClosingFields => ({
  professionalNotes: review?.professionalNotes ?? "",
  patientMessage: {
    es: review?.patientMessage.es ?? "",
    en: review?.patientMessage.en ?? "",
  },
  criticalAlertsConfirmed: review?.criticalAlertsConfirmed ?? false,
  aiDraftConfirmed: review?.aiDraftConfirmed ?? false,
});
export function NutritionCycleClosing(props: Props) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => fetchCycleClosing(props.cycleId, signal),
    [props.cycleId],
  );
  const resource = useNutritionResource(load);
  if (resource.loading)
    return (
      <div className="nutrition-review-notice" role="status">
        {t("Cargando borrador del cierre…")}
      </div>
    );
  if (resource.error || resource.data === undefined)
    return (
      <div className="nutrition-review-notice" role="alert">
        <p>
          {t(
            "No pudimos cargar el cierre. Los registros del período siguen disponibles.",
          )}
        </p>
        <Button variant="outline" onClick={resource.retry}>
          {t("Reintentar cierre")}
        </Button>
      </div>
    );
  return <ClosingForm {...props} initial={resource.data} />;
}
function ClosingForm({
  initial,
  ...props
}: Props & { initial: CycleClosing | null }) {
  const t = useT();
  const { lang } = useI18n();
  const { can } = useAppContext();
  const id = useId();
  const publishedDate = (value:string) => new Intl.DateTimeFormat(lang==='en'?'en-US':'es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:props.timezone}).format(new Date(value));
  const [review, setReview] = useState(initial);
  const [fields, setFields] = useState(() => fieldsOf(initial));
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [next, setNext] = useState<ClosingNextPlan | null>(null);
  const [planKey, setPlanKey] = useState(0);
  const [issue, setIssue] = useState<NutritionServiceIssue | null>(null);
  const [checkRequired, setCheckRequired] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [remove, setRemove] = useState<CycleClosingAttachment | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [visible, setVisible] = useState(false);
  const [fileError, setFileError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [previewLang, setPreviewLang] = useState<"es" | "en">(lang);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  const published = !!review?.publishedAt;
  const dirty = JSON.stringify(fields) !== JSON.stringify(fieldsOf(review));
  const permitted = can("Nutrition.Approve") && can("Nutrition.NotesView");
  const editable =
    permitted && !published && !busy && !planBusy && !checkRequired;
  const locked = busy || planBusy || (!published && dirty);
  const onLock = props.onLock;
  useEffect(() => {
    onLock(locked);
    return () => onLock(false);
  }, [locked, onLock]);
  useEffect(() => {
    if (!locked) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [locked]);
  function change(update: Partial<CycleClosingFields>) {
    setFields((value) => ({
      ...value,
      ...update,
      ...(update.patientMessage ? { aiDraftConfirmed: false } : {}),
    }));
    setNotice("");
  }
  function choosePlan(value: ClosingNextPlan | null) {
    setNext(value);
    change({ criticalAlertsConfirmed: false });
  }
  async function mutate(operation: (signal: AbortSignal) => Promise<void>) {
    if (running.current || !editable) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setIssue(null);
    setNotice("");
    try {
      await operation(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        const problem = nutritionIssue(error);
        setIssue(problem);
        setCheckRequired(
          problem.kind === "contract" ||
            problem.kind === "conflict" ||
            problem.status === 0 ||
            problem.status >= 500,
        );
      }
    } finally {
      running.current = null;
      setBusy(false);
    }
  }
  async function save() {
    await mutate(async (signal) => {
      const saved = await saveCycleClosing(
        props.cycleId,
        review?.revision ?? 0,
        fields,
        signal,
      );
      if (signal.aborted) return;
      setReview(saved);
      setFields(fieldsOf(saved));
      setNotice("Cierre guardado. Puedes retomarlo más tarde.");
    });
  }
  async function generateAi() {
    if (!editable || dirty) return;
    setAiBusy(true);
    setAiWarning(null);
    await mutate(async (signal) => {
      const result = await generateCycleAiDraft(
        props.cycleId,
        review?.revision ?? 0,
        lang,
        signal,
      );
      if (signal.aborted) return;
      if (result.status === "unavailable") {
        setAiWarning(
          result.warning ??
            t("La IA no está disponible. Continúa la revisión manual."),
        );
        return;
      }
      const fresh = await fetchCycleClosing(props.cycleId, signal);
      if (signal.aborted) return;
      if (!fresh || fresh.revision !== result.revision)
        throw Error("cycle-ai-reload");
      setReview(fresh);
      setFields(fieldsOf(fresh));
      setAiWarning(result.warning);
    });
    setAiBusy(false);
  }
  const parsedAi = parseCycleAiDraft(review?.aiDraft);
  const aiEdited =
    !!parsedAi &&
    (fields.patientMessage.es.trim() !== (parsedAi.draft.es ?? "").trim() ||
      fields.patientMessage.en.trim() !== (parsedAi.draft.en ?? "").trim());
  async function reload() {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setIssue(null);
    try {
      const fresh = await fetchCycleClosing(props.cycleId, controller.signal);
      if (controller.signal.aborted) return;
      setReview(fresh);
      if (!dirty || fresh?.publishedAt) setFields(fieldsOf(fresh));
      else setFields(value => ({
        ...value,
        criticalAlertsConfirmed: false,
        aiDraftConfirmed: JSON.stringify(fresh?.aiDraft) === JSON.stringify(review?.aiDraft)
          ? value.aiDraftConfirmed : false,
      }));
      setCheckRequired(false);
      setNext(null);
      setPlanKey((v) => v + 1);
      setNotice(
        dirty
          ? "Estado actualizado. Conservamos tus textos locales; compáralos con la versión del servidor antes de guardar."
          : "Estado del cierre actualizado.",
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setIssue(nutritionIssue(error));
        setCheckRequired(true);
      }
    } finally {
      running.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const requirements = [
    {
      ok: !!fields.professionalNotes.trim(),
      label: "Evaluación interna completa",
    },
    {
      ok:
        !!fields.patientMessage.es.trim() && !!fields.patientMessage.en.trim(),
      label: "Mensaje a la persona completo en español e inglés",
    },
    { ok: !!next, label: "Plan siguiente preparado y enviado a aprobación" },
    {
      ok: fields.criticalAlertsConfirmed,
      label: "Alertas revisadas y confirmadas",
    },
    {
      ok:
        !cycleAiRequiresConfirmation(review?.aiDraft) ||
        (fields.aiDraftConfirmed && aiEdited),
      label: "Borrador de IA revisado, si existe",
    },
    {
      ok: !!props.period.endDate && props.period.endDate < props.today,
      label: "Ciclo terminado en la fecha local de la persona",
    },
    { ok: !!review && !dirty, label: "Últimos cambios guardados" },
  ];
  const ready = editable && requirements.every((item) => item.ok);
  const sections = props.section;
  const visibleImages = (review?.attachments ?? []).filter(
    (a) => a.kind === "image" && a.visibleToPatient,
  );
  const message = fields.patientMessage[previewLang];
  return (
    <>
      {sections(
        3,
        <div className="nutrition-closing-fields">
          {!permitted && (
            <p className="nutrition-review-notice">
              {t(
                "Para editar y publicar el cierre necesitas permiso de aprobación y acceso a notas internas.",
              )}
            </p>
          )}
          {published && (
            <p className="nutrition-closing-success" role="status">
              <CheckCircle2 aria-hidden="true" />
              {t("Cierre publicado · solo lectura")}
            </p>
          )}
          <div className="nutrition-closing-private">
            <span className="nutrition-closing-label">
              <LockKeyhole className="size-4" aria-hidden="true" />
              {t("Solo el equipo clínico")}
            </span>
            <label htmlFor={`${id}-notes`}>
              {t("Evaluación interna (obligatoria para publicar)")}
            </label>
            <p id={`${id}-notes-help`}>
              {t("Estas notas no aparecen en la app de la persona.")}
            </p>
            <Textarea
              id={`${id}-notes`}
              aria-describedby={`${id}-notes-help`}
              value={can("Nutrition.NotesView") ? fields.professionalNotes : ""}
              disabled={!editable}
              maxLength={10000}
              rows={5}
              onChange={(e) => change({ professionalNotes: e.target.value })}
            />
          </div>
          <NutritionCycleAiPanel
            value={review?.aiDraft}
            busy={aiBusy}
            editable={editable}
            dirty={dirty}
            warning={aiWarning}
            confirmed={fields.aiDraftConfirmed}
            message={fields.patientMessage}
            onGenerate={() => void generateAi()}
            onCancel={() => {
              running.current?.abort();
              setCheckRequired(true);
              setNotice(
                "Consulta de IA cancelada. Comprueba el estado antes de continuar.",
              );
            }}
            onCopy={(draft) =>
              change({
                patientMessage: {
                  es: draft.draft.es ?? "",
                  en: draft.draft.en ?? "",
                },
              })
            }
            onConfirm={(confirmed) => change({ aiDraftConfirmed: confirmed })}
          />
          {dirty && (
            <p role="status">
              {t(
                "Tienes cambios sin guardar. Guarda o descarta antes de salir del cierre.",
              )}
            </p>
          )}
          <div className="nutrition-closing-actions">
            <Button
              disabled={!editable || (!dirty && !!review)}
              onClick={() => void save()}
            >
              {t(busy ? "Guardando cierre…" : "Guardar y retomar luego")}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || planBusy || !dirty || published}
              onClick={() => {
                setFields(fieldsOf(review));
                setNotice("Cambios locales descartados.");
              }}
            >
              {t("Descartar cambios locales")}
            </Button>
          </div>
        </div>,
      )}
      {sections(
        4,
        published ? (
          <p>
            {t(
              "El siguiente plan y este mensaje se publicaron en la misma operación.",
            )}
          </p>
        ) : (
          <>
            <NutritionNextCyclePlan
              key={planKey}
              patientId={props.patientId}
              sourceId={props.sourceId}
              cycleId={props.cycleId}
              disabled={!editable}
              onReady={choosePlan}
              onBusy={setPlanBusy}
            />
            {next && (
              <p className="nutrition-closing-success">
                {t("Plan siguiente listo para la publicación conjunta.")}
              </p>
            )}
          </>
        ),
      )}
      {sections(
        5,
        <div className="nutrition-closing-fields">
          <fieldset disabled={!editable} className="nutrition-closing-message">
            <legend>{t("Recomendaciones que verá la persona")}</legend>
            <p>
              {t(
                "Escribe la versión final en ambos idiomas. Las notas internas y el borrador de IA no se copian automáticamente.",
              )}
            </p>
            <div className="nutrition-closing-bilingual">
              {(["es", "en"] as const).map((code) => (
                <label key={code}>
                  <span>
                    {t(
                      code === "es"
                        ? "Mensaje a la persona · Español"
                        : "Mensaje a la persona · English",
                    )}
                  </span>
                  <Textarea
                    lang={code}
                    rows={7}
                    maxLength={10000}
                    value={fields.patientMessage[code]}
                    onChange={(e) =>
                      change({
                        patientMessage: {
                          ...fields.patientMessage,
                          [code]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
          {!published && (
            <>
              <h3>{t("Alertas del plan siguiente")}</h3>
              {next ? (
                <>
                  {next.alerts.length ? (
                    <ul className="nutrition-closing-alerts">
                      {next.alerts.map((alert, i) => (
                        <li
                          key={`${alert.code}:${i}`}
                          data-severity={alert.severity}
                        >
                          {alert.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t("El plan seleccionado no devuelve alertas.")}</p>
                  )}
                </>
              ) : (
                <p>
                  {t(
                    "Selecciona y revisa el plan siguiente antes de confirmar sus alertas.",
                  )}
                </p>
              )}
              <label className="nutrition-closing-check">
                <input
                  type="checkbox"
                  checked={fields.criticalAlertsConfirmed}
                  disabled={!editable || !next}
                  onChange={(e) =>
                    change({ criticalAlertsConfirmed: e.target.checked })
                  }
                />
                <span>
                  {t(
                    "Revisé personalmente las alertas y la validación del plan siguiente.",
                  )}
                </span>
              </label>
            </>
          )}
          <h3>{t("Adjuntos del cierre")}</h3>
          <p>
            {t(
              "Los archivos son internos por defecto. Solo las imágenes marcadas como visibles se publican en la app; los PDF permanecen internos.",
            )}
          </p>
          {can("Nutrition.PhotosView") ? (
            <>
              {(review?.attachments ?? []).length ? (
                <ul className="nutrition-closing-attachments">
                  {review!.attachments.map((a) => (
                    <li key={a.id}>
                      {a.kind === "image" ? (
                        <ClosingImage
                          attachment={a}
                          refresh={() => void reload()}
                        />
                      ) : a.url ? (
                        <a
                          href={cycleAttachmentUrl(a.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("Descargar documento interno")}
                        </a>
                      ) : (
                        <span>{t("Documento interno no disponible")}</span>
                      )}
                      <p className="nutrition-closing-caption">
                        {a.caption || t("Sin pie de imagen")}
                      </p>
                      <span className="nutrition-closing-label">
                        {t(
                          a.kind === "image" && a.visibleToPatient
                            ? "Visible para la persona"
                            : "Solo el equipo clínico",
                        )}
                      </span>
                      {!published && (
                        <Button
                          variant="outline"
                          disabled={!editable || dirty}
                          onClick={() => setRemove(a)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          {t("Quitar adjunto")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {t("Todavía no hay adjuntos. Puedes publicar solo texto.")}
                </p>
              )}
              {!published && (
                <div className="nutrition-closing-upload">
                  <label htmlFor={`${id}-file`}>
                    {t("Archivo · JPEG, PNG, WebP o PDF · máximo 10 MB")}
                  </label>
                  <input
                    ref={fileInput}
                    id={`${id}-file`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    disabled={!editable || dirty || !review}
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setVisible(false);
                      setFileError(false);
                    }}
                  />
                  <label htmlFor={`${id}-caption`}>
                    {t("Pie del adjunto (opcional)")}
                  </label>
                  <Textarea
                    id={`${id}-caption`}
                    maxLength={2000}
                    rows={2}
                    disabled={!editable || dirty || !review}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                  <label className="nutrition-closing-check">
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={
                        !editable ||
                        dirty ||
                        !review ||
                        !file?.type.startsWith("image/")
                      }
                      onChange={(e) => setVisible(e.target.checked)}
                    />
                    <span>
                      {t(
                        "Mostrar esta imagen y su pie a la persona al publicar",
                      )}
                    </span>
                  </label>
                  {(!review || dirty) && (
                    <p>
                      {t(
                        "Guarda los cambios del cierre antes de adjuntar archivos.",
                      )}
                    </p>
                  )}
                  {fileError && (
                    <p role="alert">
                      {t(
                        "Selecciona un JPEG, PNG, WebP o PDF válido de hasta 10 MB.",
                      )}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    disabled={!editable || dirty || !review || !file}
                    onClick={() => {
                      if (
                        !file ||
                        file.size <= 0 ||
                        file.size > 10 * 1024 * 1024 ||
                        ![
                          "image/jpeg",
                          "image/png",
                          "image/webp",
                          "application/pdf",
                        ].includes(file.type)
                      ) {
                        setFileError(true);
                        return;
                      }
                      void mutate(async (signal) => {
                        const result = await uploadCycleAttachment(
                          props.cycleId,
                          review!.revision,
                          file,
                          caption,
                          visible && file.type.startsWith("image/"),
                          signal,
                        );
                        if (signal.aborted) return;
                        setReview({
                          ...review!,
                          revision: result.revision,
                          attachments: [
                            ...review!.attachments,
                            result.attachment,
                          ],
                        });
                        setFile(null);
                        setCaption("");
                        setVisible(false);
                        if (fileInput.current) fileInput.current.value = "";
                        setNotice(
                          "Adjunto guardado. Comprueba su visibilidad antes de publicar.",
                        );
                      });
                    }}
                  >
                    <Upload className="size-4" aria-hidden="true" />
                    {t("Guardar adjunto")}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="nutrition-review-notice">
              {t(
                "No tienes permiso para consultar ni adjuntar fotos y documentos de este cierre.",
              )}
            </p>
          )}
        </div>,
      )}
      {sections(
        6,
        <div className="nutrition-closing-fields">
          {issue && (
            <div role="alert" className="nutrition-review-notice">
              <p>
                {t(
                  issue.kind === "conflict"
                    ? "El cierre o el plan cambió en el servidor. Conservamos tus textos. Comprueba el estado antes de continuar."
                    : "No se pudo confirmar la operación. Conservamos tus textos y no damos por publicada la revisión.",
                )}
              </p>
              {issue.status === 422 && (
                <p>
                  {t(
                    "Revisa los requisitos del cierre y el plan seleccionado.",
                  )}
                </p>
              )}
              {checkRequired && (
                <p>
                  {t(
                    "Comprueba el estado del servidor antes de reintentar una escritura.",
                  )}
                </p>
              )}
            </div>
          )}
          <div className="nutrition-closing-actions">
            <Button
              variant="outline"
              disabled={busy || planBusy}
              onClick={() => void reload()}
            >
              {t("Comprobar estado del cierre")}
            </Button>
            {notice && <p role="status">{t(notice)}</p>}
          </div>
          {dirty && review && (
            <details>
              <summary>{t("Ver textos guardados en el servidor")}</summary>
              <p className="nutrition-closing-caption">
                {can("Nutrition.NotesView") && review.professionalNotes}
              </p>
              <p className="nutrition-closing-caption">
                {review.patientMessage.es}
              </p>
              <p className="nutrition-closing-caption" lang="en">
                {review.patientMessage.en}
              </p>
            </details>
          )}
          <div
            className="nutrition-closing-preview"
            aria-label={t("Vista previa para la persona")}
          >
            <div className="nutrition-closing-actions">
              <h3>{t("Recomendaciones de tu nutricionista")}</h3>
              <label>
                <span className="sr-only">
                  {t("Idioma de la vista previa")}
                </span>
                <select
                  aria-label={t("Idioma de la vista previa")}
                  value={previewLang}
                  onChange={(e) =>
                    setPreviewLang(e.target.value as "es" | "en")
                  }
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            <p>
              {t("Cierre del ciclo {cycle}", {
                cycle: String(props.period.number ?? "—"),
              })}
            </p>
            <p>
              {published
                ? publishedDate(review!.publishedAt!)
                : t("El profesional y la fecha se registran al publicar.")}
            </p>
            <p className="nutrition-closing-caption" lang={previewLang}>
              {message || t("El mensaje a la persona aún está vacío.")}
            </p>
            {visibleImages.length ? (
              <div className="nutrition-closing-visible-images">
                {visibleImages.map((a) => (
                  <figure key={a.id}>
                    <ClosingImage
                      attachment={a}
                      refresh={() => void reload()}
                    />
                    {a.caption && <figcaption>{a.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            ) : (
              <p>{t("Sin imágenes visibles para la persona.")}</p>
            )}
          </div>
          {published ? (
            <div className="nutrition-closing-success" role="status">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <h3>{t("Plan y mensaje publicados")}</h3>
                <p>
                  {t(
                    "El aviso quedó registrado en la app. Este cierre ya no se puede editar.",
                  )}
                </p>
                <p>
                  {t(
                    "El resumen de esta publicación queda congelado; los registros de los pasos 1 a 3 siguen siendo una consulta actual.",
                  )}
                </p>
              </div>
            </div>
          ) : (
            <>
              <h3>{t("Antes de publicar")}</h3>
              <ul className="nutrition-closing-requirements">
                {requirements.map((item) => (
                  <li key={item.label}>
                    <span aria-hidden="true">{item.ok ? "✓" : "○"}</span>
                    <span>{t(item.label)}</span>
                    <strong>{t(item.ok ? "Listo" : "Pendiente")}</strong>
                  </li>
                ))}
              </ul>
              <p>
                {t(
                  "Al confirmar se publican el plan siguiente y el mensaje del ciclo revisado en una sola operación. Si falla, no se confirma ninguna publicación.",
                )}
              </p>
              <Button disabled={!ready} onClick={() => setConfirm(true)}>
                {t("Publicar plan y mensaje")}
              </Button>
            </>
          )}
        </div>,
      )}
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!busy) setConfirm(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("¿Publicar el plan siguiente y el mensaje?")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "La persona verá el mensaje final y las imágenes visibles. Las notas internas y la IA no se publican. El cierre será de solo lectura.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              {t("Cancelar")}
            </Button>
            <Button
              disabled={!ready || busy}
              onClick={() =>
                void mutate(async (signal) => {
                  const result = await publishCycleClosing(
                    props.cycleId,
                    review!.revision,
                    next!,
                    signal,
                  );
                  if (signal.aborted) return;
                  setReview(result);
                  setFields(fieldsOf(result));
                  setConfirm(false);
                })
              }
            >
              {t(
                busy ? "Publicando cierre…" : "Confirmar publicación conjunta",
              )}
            </Button>
          </DialogFooter>
          {issue && (
            <p role="alert">
              {t(
                "La publicación no se confirmó. Cierra este diálogo y comprueba el estado del cierre.",
              )}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open && !busy) setRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("¿Quitar este adjunto del borrador?")}</DialogTitle>
            <DialogDescription>
              {t(
                "Dejará de formar parte del cierre. Esta acción no publica el mensaje.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRemove(null)}
            >
              {t("Cancelar")}
            </Button>
            <Button
              disabled={!editable || busy}
              onClick={() =>
                void mutate(async (signal) => {
                  const result = await deleteCycleAttachment(
                    props.cycleId,
                    review!.revision,
                    remove!.id,
                    signal,
                  );
                  if (signal.aborted) return;
                  setReview({
                    ...review!,
                    revision: result.revision,
                    attachments: review!.attachments.filter(
                      (a) => a.id !== remove!.id,
                    ),
                  });
                  setRemove(null);
                })
              }
            >
              {t("Confirmar quitar adjunto")}
            </Button>
          </DialogFooter>
          {issue && (
            <p role="alert">
              {t(
                "No se pudo confirmar el cambio del adjunto. Comprueba el estado antes de reintentar.",
              )}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function ClosingImage({
  attachment,
  refresh,
}: {
  attachment: CycleClosingAttachment;
  refresh: () => void;
}) {
  const t = useT();
  return (
    <SignedImage
      key={attachment.url}
      attachment={attachment}
      refresh={refresh}
      t={t}
    />
  );
}
function SignedImage({
  attachment,
  refresh,
  t,
}: {
  attachment: CycleClosingAttachment;
  refresh: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [failed, setFailed] = useState(false);
  return !failed && attachment.url ? (
    <Image
      unoptimized
      width={640}
      height={400}
      src={cycleAttachmentUrl(attachment.url)}
      alt={attachment.caption || t("Imagen adjunta al cierre")}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="nutrition-review-notice">
      <p>{t("La imagen no está disponible o su enlace caducó.")}</p>
      <Button variant="outline" onClick={refresh}>
        {t("Actualizar imágenes del cierre")}
      </Button>
    </div>
  );
}
