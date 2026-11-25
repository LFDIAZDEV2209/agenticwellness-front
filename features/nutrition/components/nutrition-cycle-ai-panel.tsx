"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useT } from "@/providers/i18n-provider";
import {
  parseCycleAiDraft,
  type CycleAiDraft,
} from "../services/nutrition-cycle-closing-service";

export function NutritionCycleAiPanel({
  value,
  busy,
  editable,
  dirty,
  warning,
  confirmed,
  message,
  onGenerate,
  onCancel,
  onCopy,
  onConfirm,
}: {
  value: unknown;
  busy: boolean;
  editable: boolean;
  dirty: boolean;
  warning: string | null;
  confirmed: boolean;
  message: { es: string; en: string };
  onGenerate: () => void;
  onCancel: () => void;
  onCopy: (draft: CycleAiDraft) => void;
  onConfirm: (confirmed: boolean) => void;
}) {
  const t = useT();
  const draft = parseCycleAiDraft(value);
  const [copy, setCopy] = useState(false);
  const untouched =
    !!draft &&
    draft.status === "ok" &&
    message.es.trim() === (draft.draft.es ?? "").trim() &&
    message.en.trim() === (draft.draft.en ?? "").trim();
  return (
    <div className="nutrition-closing-ai">
      <span className="nutrition-closing-label">
        <Sparkles className="size-4" aria-hidden="true" />
        {t("Borrador de IA · no es una recomendación aprobada")}
      </span>
      <p>
        {t(
          "La IA propone. Revisa sus datos y redacta la versión final; no modifica metas ni publica contenido.",
        )}
      </p>
      <div className="nutrition-closing-actions">
        <Button
          variant="outline"
          disabled={!editable || dirty || busy}
          onClick={onGenerate}
        >
          {t(
            busy
              ? "Consultando resumen de IA…"
              : draft
                ? "Volver a generar borrador de IA"
                : "Generar borrador de IA",
          )}
        </Button>
        {busy && (
          <Button variant="outline" onClick={onCancel}>
            {t("Cancelar consulta de IA")}
          </Button>
        )}
      </div>
      {dirty && (
        <p>{t("Guarda los cambios antes de pedir un nuevo borrador de IA.")}</p>
      )}
      {busy && (
        <p role="status">
          {t(
            "La consulta está en curso. No se ha copiado contenido al mensaje del paciente.",
          )}
        </p>
      )}
      {warning && <p role="status">{warning}</p>}
      {value != null && !draft && (
        <p role="alert">
          {t(
            "No pudimos interpretar el borrador guardado. Comprueba el estado del cierre antes de confirmarlo.",
          )}
        </p>
      )}
      {draft && (
        <>
          {draft.status === "insufficient" ? (
            <p role="status">
              {t(
                "No hay datos suficientes para un borrador. Continúa la revisión manual; no hay texto de IA que confirmar.",
              )}
            </p>
          ) : (
            <>
              <h3>{t("Resumen propuesto por IA")}</h3>
              <p className="nutrition-closing-caption">{draft.summary}</p>
              {!!draft.patterns.length && (
                <>
                  <h4>{t("Patrones propuestos")}</h4>
                  <ul>
                    {draft.patterns.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
              {!!draft.gaps.length && (
                <>
                  <h4>{t("Datos faltantes señalados por IA")}</h4>
                  <ul>
                    {draft.gaps.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
              <div className="nutrition-closing-bilingual">
                {(["es", "en"] as const).map((code) => (
                  <div key={code}>
                    <h4>
                      {t(
                        code === "es"
                          ? "Propuesta IA · Español"
                          : "Propuesta IA · English",
                      )}
                    </h4>
                    <p lang={code} className="nutrition-closing-caption">
                      {draft.draft[code]}
                    </p>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                disabled={!editable || busy}
                onClick={() => setCopy(true)}
              >
                {t("Usar la propuesta como base del mensaje")}
              </Button>
              {untouched && (
                <p role="status">
                  {t(
                    "Edita o descarta el texto propuesto antes de confirmar el mensaje final.",
                  )}
                </p>
              )}
              <label className="nutrition-closing-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!editable || busy || untouched}
                  onChange={(e) => onConfirm(e.target.checked)}
                />
                <span>
                  {t(
                    "Revisé el borrador de IA y la redacción final es mi responsabilidad profesional.",
                  )}
                </span>
              </label>
            </>
          )}
          <details>
            <summary>{t("Trazabilidad y datos consultados")}</summary>
            <dl className="nutrition-closing-ai-trace">
              <div>
                <dt>{t("Modelo")}</dt>
                <dd>{draft.model}</dd>
              </div>
              <div>
                <dt>{t("Generado")}</dt>
                <dd>{draft.generatedAt}</dd>
              </div>
              <div>
                <dt>{t("Datos capturados")}</dt>
                <dd>{draft.capturedAt}</dd>
              </div>
              <div>
                <dt>{t("Período consultado")}</dt>
                <dd>
                  {draft.inputs.startDate} – {draft.inputs.endDate}
                </dd>
              </div>
              <div>
                <dt>{t("Días con registros consultados")}</dt>
                <dd>{draft.inputs.aggregates.daysWithRecords}</dd>
              </div>
              <div>
                <dt>{t("Muestra de registros consultados")}</dt>
                <dd>{draft.inputs.records.length}</dd>
              </div>
              <div>
                <dt>{t("Identificador de entradas")}</dt>
                <dd className="break-all">{draft.inputHash}</dd>
              </div>
            </dl>
            <p>
              {t(
                "La muestra es acotada. Los días sin datos quedan vacíos y la cobertura describe solo los registros disponibles.",
              )}
            </p>
          </details>
        </>
      )}
      <Dialog open={copy} onOpenChange={setCopy}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("¿Usar la propuesta de IA como base?")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Reemplazará los mensajes locales en español e inglés. Revisa y edita el texto antes de confirmar; esta acción no guarda ni publica.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopy(false)}>
              {t("Cancelar")}
            </Button>
            <Button
              disabled={!editable || !draft}
              onClick={() => {
                onCopy(draft!);
                setCopy(false);
              }}
            >
              {t("Copiar propuesta para editar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
