"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppContext } from "@/providers/context-provider";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/providers/i18n-provider";
import { ApiError } from "@/lib/api/http";
import { isEditorialText, suggestPodcastMetadata } from "../services/podcast-metadata-service";
import type { PodcastMetadataDraft, PodcastMetadataResult } from "../types/podcast-metadata";
import { mediaCategoryMeta } from "./media-meta";

type State = { key: string } & (
  | { status: "loading" }
  | { status: "ready"; result: Extract<PodcastMetadataResult, { status: "ok" }> }
  | { status: "error"; message: string }
);

/** Generar y aceptar son acciones separadas; el formulario conserva la edición manual. */
export function PodcastMetadataAssistant({ title, revision, saving, onAccept }: {
  title: string;
  revision: string;
  saving: boolean;
  onAccept: (draft: PodcastMetadataDraft) => void;
}) {
  const { t, lang } = useI18n();
  const { can, activeClinicId } = useAppContext();
  const { user } = useAuth();
  const allowed = can("Media.Create") && can("Program.AiManage");
  const [context, setContext] = useState("");
  const [state, setState] = useState<State | null>(null);
  const request = useRef<AbortController | null>(null);
  const id = useId();
  const key = JSON.stringify([title, revision, context, lang, activeClinicId, user?.id, allowed, saving]);
  const current = state?.key === key ? state : null;
  // Olvidar el intento anterior también al deshacer una edición: no revivir
  // un borrador descartado ni dejar un estado loading de una petición abortada.
  if (state && state.key !== key) setState(null);
  const pending = current?.status === "loading";
  const valid = Boolean(title.trim()) && title.length <= 200 && context.length <= 16000
    && isEditorialText(title) && isEditorialText(context);

  // Cambios de contenido, identidad, idioma o contexto invalidan respuestas en vuelo.
  useEffect(() => () => { request.current?.abort(); request.current = null; }, [key]);

  async function generate() {
    if (!allowed || !valid || saving || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState({ key, status: "loading" });
    try {
      const result = await suggestPodcastMetadata({ title, language: lang, context }, controller.signal);
      if (controller.signal.aborted) return;
      setState(result.status === "ok" ? { key, status: "ready", result } : {
        key, status: "error", message: "La ayuda de IA no está disponible. Puedes reintentar o completar los campos manualmente.",
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ key, status: "error", message: error instanceof ApiError && error.status === 403
        ? "No tienes permiso para solicitar sugerencias. Puedes completar los campos manualmente."
        : "La ayuda de IA no está disponible. Puedes reintentar o completar los campos manualmente." });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  if (!allowed) return null;
  return (
    <section aria-labelledby={`${id}-title`} data-testid="podcast-metadata-assistant" className="flex min-w-0 flex-col gap-3">
      <h3 id={`${id}-title`} className="text-sm font-semibold">{t("Ayuda de IA para el podcast")}</h3>
      <p className="text-sm text-muted-foreground">{t("Sugiere descripción, categoría y etiquetas a partir del título y el contexto que escribas.")}</p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-context`}>{t("Contexto editorial (opcional)")}</FieldLabel>
          <Textarea id={`${id}-context`} value={context} maxLength={16000} rows={3} disabled={saving}
            aria-describedby={`${id}-help`} onChange={event => setContext(event.target.value)} />
          <FieldDescription id={`${id}-help`}>{t("Incluye solo información del episodio, sin datos de pacientes, credenciales ni enlaces. El audio no se envía ni se transcribe.")}</FieldDescription>
        </Field>
      </FieldGroup>
      <Button type="button" variant="outline" className="min-h-11 w-full whitespace-normal sm:w-fit"
        disabled={!valid || pending || saving} onClick={() => void generate()}>
        <Sparkles data-icon="inline-start" aria-hidden="true" />
        {pending ? t("Generando sugerencias…") : t("Sugerir metadatos con IA")}
      </Button>
      {!valid && <p className="text-xs text-muted-foreground">{t("Escribe un título de hasta 200 caracteres y usa texto sin HTML ni URLs para solicitar ayuda.")}</p>}
      <div aria-live="polite" aria-atomic="true">
        {pending && <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{t("Generando sugerencias…")}</span>
          <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" />
        </div>}
        {current?.status === "error" && <Alert><AlertDescription>{t(current.message)}</AlertDescription></Alert>}
        {current?.status === "ready" && <div className="flex min-w-0 flex-col gap-3" data-testid="podcast-metadata-draft">
          <p className="text-sm font-semibold">{t("Estimado por IA")}</p>
          {current.result.model && <p className="break-words text-xs text-muted-foreground">{t("Modelo: {model}", { model: current.result.model })}</p>}
          <time dateTime={current.result.generatedAt} className="text-xs text-muted-foreground">
            {new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(current.result.generatedAt))}
          </time>
          <dl className="flex min-w-0 flex-col gap-2 text-sm [overflow-wrap:anywhere]">
            <div><dt className="font-medium">{t("Descripción")}</dt><dd>{current.result.draft.description}</dd></div>
            <div><dt className="font-medium">{t("Categoría")}</dt><dd>{t(mediaCategoryMeta[current.result.draft.category].label)}</dd></div>
            <div><dt className="font-medium">{t("Etiquetas")}</dt><dd>{current.result.draft.tags.length ? current.result.draft.tags.join(", ") : t("Sin etiquetas")}</dd></div>
          </dl>
          <p className="text-xs text-muted-foreground">{t("Al usar las sugerencias se reemplazan descripción, categoría y etiquetas del formulario. Podrás editarlas antes de guardar.")}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => {
              onAccept(current.result.draft); setState(null);
            }}>{t("Usar sugerencias")}</Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setState(null)}>{t("Descartar")}</Button>
          </div>
        </div>}
      </div>
    </section>
  );
}
