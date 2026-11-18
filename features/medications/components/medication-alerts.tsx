"use client";
import { useCallback, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Bell, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useT } from "@/providers/i18n-provider";
import { fetchMedicationAlerts, followMedicationAlert } from "../services";
import {
  useMedicationResource,
  useMedicationCapabilities,
  medicationErrorKey,
} from "../hooks";
import {
  alertLabels,
  monitoringStatus,
  type MedicationAlert,
} from "../monitoring-types";
import { MedicationError, MedicationLoading } from "./medication-shared";
import {
  MonitoringPagination,
  useMonitoringFormat,
} from "./medication-monitoring-shared";
export function MedicationAlerts() {
  const t = useT(),
    fmt = useMonitoringFormat(),
    cap = useMedicationCapabilities();
  const [status, setStatus] = useState(""),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<MedicationAlert | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const load = useCallback(
    (signal: AbortSignal) => fetchMedicationAlerts(status, kind, page, signal),
    [status, kind, page],
  );
  const r = useMedicationResource(load);
  async function follow(alert: MedicationAlert, next: string, note: string) {
    if (busy) return;
    const body = { status: next, expectedRevision: alert.revision, note };
    const signature = JSON.stringify({ id: alert.id, ...body });
    if (operation.current?.signature !== signature)
      operation.current = { signature, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await followMedicationAlert(alert.patientId, alert.id, {
        ...body,
        clientRequestId: operation.current!.id,
      });
      setSelected(null);
      r.retry();
    } catch (e) {
      setError(t(medicationErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }
  function resolve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected)
      void follow(
        selected,
        "resolved",
        String(new FormData(e.currentTarget).get("note") ?? "").trim(),
      );
  }
  return (
    <>
      <div className="medication-monitoring-filters">
        <NativeSelect
          ariaLabel={t("Estado de alertas")}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "", label: t("Todos los estados") },
            ...Object.entries(monitoringStatus)
              .filter(([key]) => key !== "follow_up")
              .map(([value, label]) => ({ value, label: t(label) })),
          ]}
        />
        <NativeSelect
          ariaLabel={t("Tipo de alerta")}
          value={kind}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
          options={[
            { value: "", label: t("Todas las alertas") },
            ...Object.entries(alertLabels).map(([value, label]) => ({
              value,
              label: t(label),
            })),
          ]}
        />
        <Button variant="outline" onClick={r.retry}>
          <RefreshCw data-icon="inline-start" />
          {t("Actualizar")}
        </Button>
      </div>
      {error && <MedicationError message={error} />}{" "}
      {selected && (
        <form
          className="medication-monitoring-card medication-monitoring-form"
          onSubmit={resolve}
        >
          <h3>
            {t(alertLabels[selected.kind])} · {selected.patientName}
          </h3>
          <Field>
            <FieldLabel htmlFor="alert-close-note">
              {t("Motivo del cierre")}
            </FieldLabel>
            <Textarea
              id="alert-close-note"
              name="note"
              required
              rows={3}
              maxLength={1000}
              disabled={busy}
            />
          </Field>
          <div className="medication-inline-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(null)}
              disabled={busy}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t("Confirmar cierre")}
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
      ) : (
        <section className="medication-monitoring-card">
          {r.data?.items.map((alert) => (
            <article className="medication-alert-row" key={alert.id}>
              <span className="medication-alert-icon">
                <Bell aria-hidden />
              </span>
              <div className="medication-alert-content">
                <div>
                  <h3>{t(alertLabels[alert.kind])}</h3>
                  <Badge
                    variant="outline"
                    tone={
                      alert.status === "resolved"
                        ? "teal"
                        : alert.severity === "high"
                          ? "amber"
                          : "slate"
                    }
                  >
                    {t(monitoringStatus[alert.status])}
                  </Badge>
                </div>
                <p>
                  <Link href={"/medications/" + alert.patientId}>
                    {alert.patientName}
                  </Link>
                  {alert.treatmentName ? " · " + alert.treatmentName : ""}
                </p>
                <small>
                  {fmt.date(alert.createdAt)}
                  {alert.assignedTo
                    ? " · " +
                      t("Responsable") +
                      ": " +
                      alert.assignedTo.slice(0, 8)
                    : ""}
                </small>
                {alert.resolutionNote && <p>{alert.resolutionNote}</p>}
                {alert.followUps.length > 0 && (
                  <details>
                    <summary>{t("Historial de seguimiento")}</summary>
                    {alert.followUps.map((h) => (
                      <div className="medication-followup-note" key={h.id}>
                        <span>
                          {fmt.date(h.createdAt)} ·{" "}
                          {t(monitoringStatus[h.status])}
                        </span>
                        <p>{h.note}</p>
                      </div>
                    ))}
                  </details>
                )}
              </div>
              {cap.canManage && alert.status !== "resolved" && (
                <div className="medication-inline-actions">
                  {alert.status === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void follow(
                          alert,
                          "in_progress",
                          t("Seguimiento iniciado"),
                        )
                      }
                    >
                      {t("Atender")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setSelected(alert)}
                  >
                    <Check data-icon="inline-start" />
                    {t("Resolver")}
                  </Button>
                </div>
              )}
            </article>
          ))}
          {!r.data?.items.length && (
            <p className="medication-empty-line">
              {t("Sin alertas para estos filtros")}
            </p>
          )}
          {r.data && (
            <MonitoringPagination
              page={page}
              total={r.data.total}
              pageSize={r.data.pageSize}
              loading={r.loading}
              onChange={setPage}
            />
          )}
        </section>
      )}
    </>
  );
}
