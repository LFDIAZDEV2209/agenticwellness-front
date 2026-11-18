"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  FileClock,
  Pause,
  PencilLine,
  Pill,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  ShieldOff,
  SkipForward,
} from "lucide-react";
import { useBreadcrumbTitle } from "@/components/layout/breadcrumb-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n, useT } from "@/providers/i18n-provider";
import { ApiError } from "@/lib/api/http";
import {
  medicationErrorKey,
  useMedicationCapabilities,
  useMedicationResource,
} from "../hooks";
import {
  fetchMedicationWorkspace,
  recordMedicationEvent,
  setMedicationAccess,
  setMedicationTreatmentStatus,
} from "../services";
import type {
  MedicationDose,
  MedicationStatus,
  MedicationTreatment,
} from "../types";
import {
  MedicationEmpty,
  MedicationError,
  MedicationLoading,
  MedicationStatusBadge,
  MedicationUnavailable,
} from "./medication-shared";
import { MedicationTreatmentForm } from "./medication-treatment-form";
import "../medications.css";

type MedicationInitialView = {
  patientId: string;
  initialTab?: "today" | "history";
  initialCreate?: boolean;
};

export function MedicationWorkspacePage({
  patientId,
  initialTab = "today",
  initialCreate = false,
}: MedicationInitialView) {
  const capability = useMedicationCapabilities();
  if (capability.loading)
    return (
      <div className="medication-page">
        <MedicationLoading />
      </div>
    );
  if (!capability.canView)
    return (
      <div className="medication-page">
        <MedicationUnavailable />
      </div>
    );
  return (
    <MedicationWorkspaceContent
      patientId={patientId}
      initialTab={initialTab}
      initialCreate={initialCreate}
      key={`${capability.scopeKey}:${patientId}:${initialTab}:${initialCreate}`}
    />
  );
}

function MedicationWorkspaceContent({
  patientId,
  initialTab = "today",
  initialCreate = false,
}: MedicationInitialView) {
  const t = useT();
  const { lang } = useI18n();
  const capability = useMedicationCapabilities();
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );
  const [tab, setTab] = useState<string>(initialTab);
  const [formOpen, setFormOpen] = useState(
    initialCreate && capability.canManage,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const operations = useRef(
    new Map<string, { signature: string; id: string }>(),
  );
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchMedicationWorkspace(patientId, date, timeZone, signal),
    [patientId, date, timeZone],
  );
  const resource = useMedicationResource(load);
  const data = resource.data;
  useBreadcrumbTitle(data?.patient.name ?? null);
  const formatTime = (value: string, zone = timeZone) =>
    new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: zone,
    }).format(new Date(value));
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CO", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(value));

  async function mutate(
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ) {
    if (busy) return;
    setBusy(key);
    setMessage(null);
    setWriteError(null);
    try {
      await action();
      setMessage(t(success));
      resource.retry();
    } catch (error) {
      setWriteError(t(medicationErrorKey(error)));
      if (error instanceof ApiError && error.status === 403) {
        capability.retry();
        resource.retry();
      }
    } finally {
      setBusy(null);
    }
  }

  function register(
    dose: MedicationDose,
    status: "taken" | "omitted",
    reason?: string,
  ) {
    const operationKey = `${dose.id}:${status}`;
    const signature = JSON.stringify({
      status,
      revision: dose.revision,
      reason,
    });
    if (operations.current.get(operationKey)?.signature !== signature)
      operations.current.set(operationKey, {
        signature,
        id: crypto.randomUUID(),
      });
    return mutate(
      dose.id,
      () =>
        recordMedicationEvent(patientId, dose.id, {
          clientRequestId: operations.current.get(operationKey)!.id,
          scheduledAt: dose.scheduledAt,
          status,
          reason,
          expectedRevision: dose.revision,
        }),
      "Registro guardado",
    );
  }

  function changeStatus(
    treatment: MedicationTreatment,
    status: MedicationStatus,
  ) {
    return mutate(
      treatment.id,
      () =>
        setMedicationTreatmentStatus(
          patientId,
          treatment.id,
          status,
          treatment.revision,
        ),
      "Tratamiento actualizado",
    );
  }

  return (
    <div className="medication-page">
      <Link
        href="/medications"
        className={`${buttonVariants({ variant: "ghost", size: "sm" })} self-start`}
      >
        <ArrowLeft data-icon="inline-start" aria-hidden />
        {t("Volver a medicamentos")}
      </Link>
      {resource.loading ? (
        <MedicationLoading />
      ) : resource.error ? (
        <MedicationError
          message={t(medicationErrorKey(resource.error))}
          retry={resource.retry}
        />
      ) : data ? (
        <>
          <header className="medication-patient-header">
            <span className="medication-header-icon">
              <Pill aria-hidden />
            </span>
            <div className="medication-patient-heading">
              <p>{t("Control de medicamentos")}</p>
              <h1 className="medication-name" title={data.patient.name}>
                {data.patient.name}
              </h1>
              <span>{data.patient.mrn}</span>
            </div>
            <div className="medication-header-actions">
              {capability.canManageAccess ? (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    void mutate(
                      "access",
                      () =>
                        setMedicationAccess(
                          patientId,
                          !data.access.enabled,
                          data.access.revision,
                        ),
                      "Acceso actualizado",
                    )
                  }
                >
                  <ShieldCheck data-icon="inline-start" aria-hidden />
                  {t(
                    data.access.enabled
                      ? "Desactivar acceso"
                      : "Activar acceso",
                  )}
                </Button>
              ) : (
                <Badge
                  variant="outline"
                  tone={data.access.enabled ? "teal" : "slate"}
                >
                  {data.access.enabled ? (
                    <ShieldCheck aria-hidden />
                  ) : (
                    <ShieldOff aria-hidden />
                  )}
                  {t(
                    data.access.enabled
                      ? "Acceso habilitado"
                      : "Acceso deshabilitado",
                  )}
                </Badge>
              )}
              {capability.canManage && (
                <Button
                  onClick={() => {
                    setFormOpen(true);
                    setWriteError(null);
                    setMessage(null);
                  }}
                  disabled={busy !== null || formOpen}
                >
                  <Plus data-icon="inline-start" aria-hidden />
                  {t("Nuevo tratamiento")}
                </Button>
              )}
            </div>
          </header>
          <div
            className="medication-summary"
            aria-label={t("Resumen del seguimiento")}
          >
            <span>
              <Pill aria-hidden />
              <strong>{data.summary.activeTreatments}</strong>
              {t("Tratamientos activos")}
            </span>
            <span>
              <CircleCheck aria-hidden />
              <strong>
                {data.summary.takenDoses}
                <span className="medication-summary-divider">
                  /{data.summary.scheduledDoses}
                </span>
              </strong>
              {t("Tomas registradas hoy")}
            </span>
            <span>
              <Clock3 aria-hidden />
              <strong>{data.summary.pendingDoses}</strong>
              {t("Pendientes")}
            </span>
          </div>
          {message && (
            <p role="status" className="medication-notice">
              <Check aria-hidden />
              {message}
            </p>
          )}
          {writeError && (
            <MedicationError message={writeError} retry={resource.retry} />
          )}
          {formOpen && capability.canManage && (
            <MedicationTreatmentForm
              patientId={patientId}
              onSaved={() => {
                setFormOpen(false);
                setMessage(t("Tratamiento registrado"));
                setTab("treatments");
                resource.retry();
              }}
              onCancel={() => setFormOpen(false)}
            />
          )}
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(String(value))}
            className="medication-workspace"
          >
            <div className="medication-tabs-toolbar">
              <TabsList aria-label={t("Seguimiento de medicamentos")}>
                <TabsTrigger value="today">
                  <Clock3 data-icon="inline-start" aria-hidden />
                  {t("Hoy")}
                </TabsTrigger>
                <TabsTrigger value="treatments">
                  <Pill data-icon="inline-start" aria-hidden />
                  {t("Tratamientos")}
                </TabsTrigger>
                <TabsTrigger value="history">
                  <FileClock data-icon="inline-start" aria-hidden />
                  {t("Historial")}
                </TabsTrigger>
              </TabsList>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("Actualizar seguimiento")}
                onClick={resource.retry}
                disabled={busy !== null}
              >
                <RefreshCw aria-hidden />
              </Button>
            </div>
            <TabsContent value="today" className="medication-panel">
              <div className="medication-panel-toolbar">
                <div>
                  <h2>{t("Tomas del día")}</h2>
                  <p>{timeZone}</p>
                </div>
                <label className="medication-date">
                  <CalendarDays aria-hidden />
                  <span className="sr-only">{t("Día de seguimiento")}</span>
                  <Input
                    type="date"
                    aria-label={t("Día de seguimiento")}
                    value={date}
                    required
                    onChange={(event) => {
                      if (event.target.value) setDate(event.target.value);
                    }}
                  />
                </label>
              </div>
              {data.doses.length ? (
                <div className="medication-dose-list">
                  {data.doses.map((dose) => (
                    <article
                      className="medication-dose-row"
                      key={dose.id}
                      aria-label={`${dose.name} ${formatTime(dose.scheduledAt, dose.timeZone)}`}
                    >
                      <time
                        className="medication-dose-time"
                        dateTime={dose.scheduledAt}
                      >
                        {formatTime(dose.scheduledAt, dose.timeZone)}
                      </time>
                      <div className="medication-dose-description">
                        <h3 className="medication-name" title={dose.name}>
                          {dose.name}
                        </h3>
                        <p>
                          {dose.dosage} {dose.unit}
                        </p>
                      </div>
                      <MedicationStatusBadge status={dose.status} />
                      {capability.canManage && dose.status === "pending" && (
                        <div className="medication-dose-actions">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              busy !== null ||
                              Date.parse(dose.scheduledAt) > now
                            }
                            onClick={() => void register(dose, "omitted")}
                          >
                            <SkipForward data-icon="inline-start" aria-hidden />
                            {t("Omitir")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              busy !== null ||
                              Date.parse(dose.scheduledAt) > now
                            }
                            onClick={() => void register(dose, "taken")}
                          >
                            <Check data-icon="inline-start" aria-hidden />
                            {t("Registrar toma")}
                          </Button>
                        </div>
                      )}
                      {capability.canManage &&
                        (dose.status === "taken" ||
                          dose.status === "omitted") && (
                          <MedicationDoseCorrection
                            dose={dose}
                            busy={busy !== null}
                            onSave={register}
                          />
                        )}
                    </article>
                  ))}
                </div>
              ) : (
                <MedicationEmpty kind="doses" />
              )}
            </TabsContent>
            <TabsContent value="treatments" className="medication-panel">
              <div className="medication-panel-toolbar">
                <h2>{t("Tratamientos registrados")}</h2>
              </div>
              {data.treatments.length ? (
                <div>
                  {data.treatments.map((treatment) => (
                    <article
                      key={treatment.id}
                      className="medication-treatment-row"
                    >
                      <div className="medication-treatment-main">
                        <span className="medication-icon">
                          <Pill aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <h3
                            className="medication-name"
                            title={treatment.name}
                          >
                            {treatment.name}
                          </h3>
                          <p>
                            {treatment.dosage} {treatment.unit}
                            {treatment.route ? ` · ${treatment.route}` : ""}
                          </p>
                        </div>
                        <MedicationStatusBadge status={treatment.status} />
                      </div>
                      <div className="medication-treatment-details">
                        <span>
                          <Clock3 aria-hidden />
                          {treatment.times.join(" · ")}
                        </span>
                        <span>
                          {t(
                            treatment.productType === "vitamin"
                              ? "Vitamina"
                              : treatment.productType === "supplement"
                                ? "Suplemento"
                                : "Medicamento",
                          )}
                        </span>
                        <span>
                          {t(
                            treatment.origin === "patient_reported"
                              ? "Registrado por paciente"
                              : treatment.origin === "legacy_import"
                                ? "Registro anterior"
                                : "Registrado por personal",
                          )}
                        </span>
                      </div>
                      {treatment.instructions && (
                        <p className="medication-instructions">
                          {treatment.instructions}
                        </p>
                      )}
                      {capability.canManage &&
                        treatment.status !== "completed" && (
                          <div className="medication-treatment-actions">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() =>
                                void changeStatus(
                                  treatment,
                                  treatment.status === "active"
                                    ? "paused"
                                    : "active",
                                )
                              }
                            >
                              {treatment.status === "active" ? (
                                <Pause data-icon="inline-start" aria-hidden />
                              ) : (
                                <Play data-icon="inline-start" aria-hidden />
                              )}
                              {t(
                                treatment.status === "active"
                                  ? "Pausar"
                                  : "Reactivar",
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy !== null}
                              onClick={() =>
                                void changeStatus(treatment, "completed")
                              }
                            >
                              <CircleCheck
                                data-icon="inline-start"
                                aria-hidden
                              />
                              {t("Finalizar")}
                            </Button>
                          </div>
                        )}
                    </article>
                  ))}
                </div>
              ) : (
                <MedicationEmpty kind="treatments" />
              )}
            </TabsContent>
            <TabsContent value="history" className="medication-panel">
              <div className="medication-panel-toolbar">
                <h2>{t("Historial de tomas")}</h2>
              </div>
              {data.history.length ? (
                <ol className="medication-event-list">
                  {data.history.map((event) => (
                    <li className="medication-event-row" key={event.id}>
                      <span className="medication-event-icon">
                        <FileClock aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <h3 className="medication-name" title={event.name}>
                          {event.name}
                        </h3>
                        <p>
                          {t(
                            event.origin === "patient_reported"
                              ? "Registrado por paciente"
                              : "Registrado por personal",
                          )}
                        </p>
                        {event.reason && (
                          <p className="medication-instructions">
                            {event.reason}
                          </p>
                        )}
                      </div>
                      <div className="medication-event-meta">
                        <MedicationStatusBadge status={event.status} />
                        <time dateTime={event.occurredAt}>
                          {formatDate(event.occurredAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <MedicationEmpty kind="history" />
              )}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}

function MedicationDoseCorrection({
  dose,
  busy,
  onSave,
}: {
  dose: MedicationDose;
  busy: boolean;
  onSave: (
    dose: MedicationDose,
    status: "taken" | "omitted",
    reason: string,
  ) => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"taken" | "omitted">(
    dose.status === "taken" ? "taken" : "omitted",
  );
  const [reason, setReason] = useState("");
  if (!open)
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <PencilLine data-icon="inline-start" aria-hidden />
        {t("Corregir registro")}
      </Button>
    );
  return (
    <form
      className="medication-dose-correction"
      aria-label={t("Corregir registro")}
      onSubmit={(event) => {
        event.preventDefault();
        if (status !== dose.status && reason.trim().length >= 3)
          void onSave(dose, status, reason.trim());
      }}
    >
      <label>
        <span>{t("Estado corregido")}</span>
        <NativeSelect
          ariaLabel={t("Estado corregido")}
          value={status}
          onChange={(value) => setStatus(value as "taken" | "omitted")}
          disabled={busy}
          options={[
            { value: "taken", label: t("Tomado") },
            { value: "omitted", label: t("Omitido") },
          ]}
        />
      </label>
      <label>
        <span>{t("Motivo de la corrección")}</span>
        <Textarea
          aria-label={t("Motivo de la corrección")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          minLength={3}
          maxLength={500}
          rows={2}
          autoFocus
          disabled={busy}
        />
      </label>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          {t("Cancelar")}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={busy || status === dose.status || reason.trim().length < 3}
        >
          <Save data-icon="inline-start" aria-hidden />
          {t("Guardar corrección")}
        </Button>
      </div>
    </form>
  );
}
