"use client";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { MessageSquareHeart, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useT } from "@/providers/i18n-provider";
import {
  useMedicationCapabilities,
  useMedicationResource,
  medicationErrorKey,
} from "../hooks";
import { fetchMedicationEffects, reviewMedicationEffect } from "../services";
import {
  monitoringStatus,
  severityLabels,
  type MedicationEffect,
} from "../monitoring-types";
import { MedicationError, MedicationLoading } from "./medication-shared";
import { useMonitoringFormat } from "./medication-monitoring-shared";
export function MedicationEffects({ patientId }: { patientId: string }) {
  const t = useT(),
    fmt = useMonitoringFormat(),
    cap = useMedicationCapabilities();
  const [selected, setSelected] = useState<MedicationEffect | null>(null),
    [status, setStatus] = useState("resolved"),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const load = useCallback(
    (signal: AbortSignal) => fetchMedicationEffects(patientId, signal),
    [patientId],
  );
  const r = useMedicationResource(load);
  async function review(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || saving) return;
    const data = new FormData(e.currentTarget);
    const body = {
      status,
      expectedRevision: selected.revision,
      note: String(data.get("note") ?? "").trim(),
    };
    const signature = JSON.stringify({ id: selected.id, ...body });
    if (operation.current?.signature !== signature)
      operation.current = { signature, id: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      await reviewMedicationEffect(patientId, selected.id, {
        ...body,
        clientRequestId: operation.current!.id,
      });
      setSelected(null);
      r.retry();
    } catch (e) {
      setError(t(medicationErrorKey(e)));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="medication-monitoring-card">
      <div className="medication-monitoring-toolbar">
        <h2>
          <MessageSquareHeart aria-hidden />
          {t("Efectos reportados")}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("Actualizar reportes")}
          onClick={r.retry}
        >
          <RefreshCw />
        </Button>
      </div>
      {error && <MedicationError message={error} />}{" "}
      {selected && (
        <form className="medication-monitoring-form" onSubmit={review}>
          <h3>{selected.symptom}</h3>
          <p>{t("Visible para el paciente")}</p>
          <NativeSelect
            ariaLabel={t("Estado del reporte")}
            value={status}
            onChange={setStatus}
            options={[
              { value: "follow_up", label: t("En seguimiento") },
              { value: "resolved", label: t("Resuelto") },
            ]}
          />
          <Field>
            <FieldLabel htmlFor="effect-review-note">
              {t("Nota de seguimiento")}
            </FieldLabel>
            <Textarea
              id="effect-review-note"
              name="note"
              required
              maxLength={1000}
              rows={3}
              disabled={saving}
            />
          </Field>
          <div className="medication-inline-actions">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setSelected(null)}
            >
              {t("Cancelar")}
            </Button>
            <Button disabled={saving} type="submit">
              {t("Guardar seguimiento")}
            </Button>
          </div>
        </form>
      )}
      {r.loading ? (
        <MedicationLoading />
      ) : r.error ? (
        <MedicationError
          message={t(medicationErrorKey(r.error))}
          retry={r.retry}
        />
      ) : r.data?.length ? (
        r.data.map((report) => (
          <article className="medication-effect-row" key={report.id}>
            <div className="medication-monitoring-toolbar">
              <div>
                <h3>{report.symptom}</h3>
                <p>
                  {fmt.date(report.occurredAt)} ·{" "}
                  {report.treatmentName ?? t("Sin medicamento asociado")}
                </p>
              </div>
              <div className="medication-inline-actions">
                <Badge
                  variant="outline"
                  tone={report.severity === "severe" ? "amber" : "slate"}
                >
                  {t(severityLabels[report.severity])}
                </Badge>
                <Badge variant="outline">
                  {t(monitoringStatus[report.status])}
                </Badge>
                {cap.canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelected(report);
                      setStatus("resolved");
                    }}
                  >
                    <Check data-icon="inline-start" />
                    {t("Resolver")}
                  </Button>
                )}
              </div>
            </div>
            {report.notes && <p>{report.notes}</p>}
            {report.followUps.map((note) => (
              <div className="medication-followup-note" key={note.id}>
                <span>
                  {fmt.date(note.createdAt)} ·{" "}
                  {t(monitoringStatus[note.status])}
                </span>
                <p>{note.note}</p>
              </div>
            ))}
          </article>
        ))
      ) : (
        <p className="medication-empty-line">{t("Sin síntomas reportados")}</p>
      )}
    </section>
  );
}
