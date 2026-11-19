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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {MedicationModuleNav} from "./medication-module-nav";
import {MedicationInventory} from "./medication-inventory";
import {MedicationEffects} from "./medication-effects";
import {MedicationTracking} from "./medication-tracking";
import {fetchMedicationExport} from "../services";
import { isRequiredMedication, medicationChannelLabels } from "../types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n, useT } from "@/providers/i18n-provider";
import { ApiError } from "@/lib/api/http";
import {
  medicationErrorKey,
  useMedicationCapabilities,
  useMedicationResource,
  useMedicationLiveRefresh,
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
  const [exporting,setExporting] = useState(false);
  const [exportPurpose,setExportPurpose] = useState("Seguimiento clínico");
  const exportMounted=useRef(true);
  useEffect(()=>{exportMounted.current=true;return()=>{exportMounted.current=false}},[]);
  const { lang } = useI18n();
  const capability = useMedicationCapabilities();
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );
  const [tab, setTab] = useState<string>(initialTab);
  const [formOpen, setFormOpen] = useState(
    initialCreate && capability.canManage,
  );
  const [editing, setEditing] = useState<MedicationTreatment | null>(null);
  const [suspending, setSuspending] = useState<MedicationTreatment | null>(null);
  const [suspensionReason, setSuspensionReason] = useState("");
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
  const resource = useMedicationResource(load, "", true);
  const data = resource.data;
  useMedicationLiveRefresh(patientId, resource.retry, data?.version);
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

  async function exportTracking() {
    if(exporting || !capability.canExport) return;
    setExporting(true);setWriteError(null);
    try {
      const csv=await fetchMedicationExport(patientId,date,timeZone,exportPurpose);
      if(!exportMounted.current)return;
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");link.href=url;link.download="medicamentos-"+date+".csv";link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(error) {if(exportMounted.current)setWriteError(t(medicationErrorKey(error)));}
    finally {if(exportMounted.current)setExporting(false);}
  }

  async function mutate(
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ) {
    if (busy) return false;
    setBusy(key);
    setMessage(null);
    setWriteError(null);
    try {
      await action();
      setMessage(t(success));
      resource.retry();
      return true;
    } catch (error) {
      setWriteError(t(medicationErrorKey(error)));
      if (error instanceof ApiError && error.status === 403) {
        capability.retry();
        resource.retry();
      }
      return false;
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
    reason?: string,
  ) {
    return mutate(
      treatment.id,
      () =>
        setMedicationTreatmentStatus(
          patientId,
          treatment.id,
          status,
          treatment.revision,
          reason,
        ),
      "Tratamiento actualizado",
    );
  }

  return (
    <div className="medication-page">
      <MedicationModuleNav current="patients" />
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
              {capability.canExport && <><NativeSelect ariaLabel={t("Finalidad de exportación")} value={exportPurpose} onChange={setExportPurpose} options={[{value:"Seguimiento clínico",label:t("Seguimiento clínico")},{value:"Entrega al paciente",label:t("Entrega al paciente")}]} /><Button variant="outline" disabled={exporting} onClick={()=>void exportTracking()}>{t("Exportar seguimiento")}</Button></>}
              {capability.canManage && (
                <Button
                  onClick={() => {
                    setEditing(null);
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
          {data.adherence && (
            <section className="medication-summary" aria-label={t("Adherencia al plan")} aria-live="polite">
              <span><CircleCheck aria-hidden /><strong>{data.adherence.percent === null ? "—" : `${data.adherence.percent}%`}</strong>{t("Adherencia al plan")}</span>
              <span>{data.adherence.dueDoses > 0 ? t("{taken} de {total} tomas asignadas", { taken: String(data.adherence.takenDoses), total: String(data.adherence.dueDoses) }) : t("Sin tomas asignadas para evaluar")}</span>
              {data.adherence.offPlanTakenDoses > 0 && <Badge variant="outline">{t("{count} tomas fuera del plan", {count: String(data.adherence.offPlanTakenDoses)})}</Badge>}
              {data.adherence.offPlanTakenDoses > 0 && data.adherence.dueDoses > data.adherence.takenDoses && <Badge variant="outline">{t("Plan asignado sin cumplir")}</Badge>}
            </section>
          )}
          {message && (
            <p role="status" className="medication-notice">
              <Check aria-hidden />
              {message}
            </p>
          )}
          {writeError && (
            <MedicationError message={writeError} retry={resource.retry} />
          )}
          {(formOpen || editing) && capability.canManage && (
            <MedicationTreatmentForm
              key={editing?.id ?? "new"}
              patientId={patientId}
              treatment={editing ?? undefined}
              onSaved={() => {
                setFormOpen(false);
                setEditing(null);
                setMessage(t(editing ? "Tratamiento actualizado" : "Tratamiento registrado"));
                setTab("treatments");
                resource.retry();
              }}
              onCancel={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            />
          )}
          <Dialog open={Boolean(suspending)} onOpenChange={(open) => { if (!open) setSuspending(null); }}>
            <DialogContent size="sm">
              <DialogTitle>{t("Suspender tratamiento")}</DialogTitle>
              <DialogDescription>{suspending?.name}</DialogDescription>
              <form onSubmit={(event) => {
                event.preventDefault();
                if (!suspending || !suspensionReason.trim()) return;
                void changeStatus(suspending, "paused", suspensionReason.trim());
                setSuspending(null);
              }}>
                <label className="grid gap-2">
                  {t("Motivo de suspensión")}
                  <Textarea required maxLength={500} value={suspensionReason}
                    onChange={(event) => setSuspensionReason(event.target.value)} />
                </label>
                <DialogFooter className="mt-4">
                  <Button type="button" variant="outline" onClick={() => setSuspending(null)}>{t("Cancelar")}</Button>
                  <Button type="submit" disabled={!suspensionReason.trim()}>{t("Confirmar suspensión")}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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
                <TabsTrigger value="tracking">{t("Semana y día")}</TabsTrigger>
                <TabsTrigger value="inventory">{t("Inventario")}</TabsTrigger>
                <TabsTrigger value="effects">{t("Efectos reportados")}</TabsTrigger>
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
                          {dose.dosage} {dose.unit} · {t(data.treatments.some(treatment => treatment.id === dose.treatmentId && isRequiredMedication(treatment)) ? "Plan asignado" : "Adicional")}
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
                        <Badge variant="outline">{t(isRequiredMedication(treatment) ? "Plan asignado" : treatment.productType === "supplement" ? "Adicional" : "Fuera del plan")}</Badge>
                        <MedicationStatusBadge status={treatment.status} />
                      </div>
                      <div className="medication-treatment-details">
                        <span>
                          <Clock3 aria-hidden />
                          {treatment.intervalHours
                            ? t("Cada {hours} horas desde las {time}", { hours: String(treatment.intervalHours), time: treatment.times[0] })
                            : treatment.times.join(" · ")}
                          {treatment.weekdayMask != null ? " · " + ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
                            .filter((_, index) => Boolean(treatment.weekdayMask! & (1 << index))).map(day => t(day)).join(", ") : ""}
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
                          {treatment.prescriber ? ` · ${treatment.prescriber}` : ""}
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
                            {treatment.origin === "staff_recorded" && (
                              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => {
                                setFormOpen(false);
                                setEditing(treatment);
                                window.requestAnimationFrame(() =>
                                  document.getElementById("medication-form-title")?.scrollIntoView({ block: "nearest" }));
                              }}>
                                <PencilLine data-icon="inline-start" aria-hidden />
                                {t("Editar dosis y horarios")}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() => {
                                if (treatment.status === "active") {
                                  setSuspensionReason("");
                                  setSuspending(treatment);
                                } else {
                                  void changeStatus(treatment, "active");
                                }
                              }}
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
            <TabsContent value="tracking">{tab==="tracking" && <MedicationTracking initialPatientId={patientId}/>}</TabsContent>
            <TabsContent value="inventory">{tab==="inventory" && <MedicationInventory patientId={patientId}/>}</TabsContent>
            <TabsContent value="effects">{tab==="effects" && <MedicationEffects patientId={patientId}/>}</TabsContent>
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
                            event.channel ? medicationChannelLabels[event.channel] : event.origin === "patient_reported"
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
                        {event.status === "pending"
                          ? <Badge variant="outline">{t("Toma deshecha")}</Badge>
                          : <MedicationStatusBadge status={event.status} />}
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
  ) => Promise<boolean>;
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
        onClick={() => {
          setStatus(dose.status === "taken" ? "taken" : "omitted");
          setReason("");
          setOpen(true);
        }}
      >
        <PencilLine data-icon="inline-start" aria-hidden />
        {t("Corregir registro")}
      </Button>
    );
  return (
    <form
      className="medication-dose-correction"
      aria-label={t("Corregir registro")}
      onSubmit={async (event) => {
        event.preventDefault();
        if (status !== dose.status && reason.trim().length >= 3 && await onSave(dose, status, reason.trim()))
          setOpen(false);
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
