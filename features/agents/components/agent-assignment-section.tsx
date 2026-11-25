"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogSearchSelect } from "@/features/appointments/components/forms/catalog-search-select";
import { fetchPatients } from "@/features/patients/services/patients-service";
import type { CatalogSearchItem, PatientListItem } from "@/features/patients/types";
import { useAuth } from "@/providers/auth-provider";
import { useAppContext } from "@/providers/context-provider";
import { useT } from "@/providers/i18n-provider";
import { assignInstance, fetchInstances } from "../services/agents-service";
import type { AgentInstance, AgentType } from "../types";

// Extensión local del listado existente: contrato BACK 6c94994, sin editar tipos de otra flota.
type LinkedPatient = PatientListItem & { userId?: string | null };
type PatientOption = CatalogSearchItem & { userId?: string | null };

export function AgentAssignmentSection({ agent }: { agent: AgentType }) {
  const { can, activeClinicId } = useAppContext();
  const { user } = useAuth();
  if (!can("Agents.Update") || (!can("Patients.View") && !can("Patients.ViewOwn"))) return null;
  // Un cambio de actor/clínica descarta selección y consultas del alcance anterior.
  return <AssignmentForm key={`${user?.id}:${activeClinicId}:${agent.id}`} agent={agent} />;
}

function AssignmentForm({ agent }: { agent: AgentType }) {
  const t = useT();
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const search = useCallback(async (query: string, signal?: AbortSignal): Promise<PatientOption[]> => {
    setSearchError(false);
    try {
      const result = await fetchPatients(1, 10, { search: query, status: "all", insurerId: "all" }, null, signal);
      return (result.data as LinkedPatient[]).map((item) => ({
        id: item.id, name: `${item.firstName} ${item.lastName}`,
        code: item.documentNumber ?? item.medicalRecordNumber ?? "",
        description: null,
        userId: item.userId,
      }));
    } catch (error) {
      if (!signal?.aborted) setSearchError(true);
      throw error;
    }
  }, []);

  const userId = typeof patient?.userId === "string" ? patient.userId.trim() : "";
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4" disabled={busy || agent.status !== "Activo"}>
      <legend className="px-2 text-sm font-semibold">{t("Asignar agente a una persona")}</legend>
      <p className="text-xs text-muted-foreground">{t("Selecciona una persona y confirma la asignación a su cuenta vinculada. La disponibilidad en Vita requiere versión activa, sincronización y consentimiento.")}</p>
      {agent.status !== "Activo" && <p role="status" className="text-sm text-muted-foreground">{t("Activa el tipo de agente antes de asignarlo.")}</p>}
      <CatalogSearchSelect search={search} placeholder={t("Buscar persona para asignar")} onSelect={(item) => setPatient(item as PatientOption)} />
      {searchError && <p role="alert" className="text-sm text-destructive">{t("No se pudieron buscar personas. Reintenta la búsqueda.")}</p>}
      {patient && (!userId ? (
        <>
          <p role="status" className="text-sm text-muted-foreground">{t("Esta persona no tiene una cuenta de usuario vinculada. Vincula su cuenta antes de asignar el agente.")}</p>
          <Button type="button" disabled className="self-start">{t("Asignar agente")}</Button>
        </>
      ) : (
        <PatientAssignment key={`${patient.id}:${userId}`} agent={agent} userId={userId} onBusyChange={setBusy} />
      ))}
    </fieldset>
  );
}

type Lookup = { status: "loading" } | { status: "error" } | { status: "ready"; instance: AgentInstance | null };

function PatientAssignment({ agent, userId, onBusyChange }: { agent: AgentType; userId: string; onBusyChange: (busy: boolean) => void }) {
  const t = useT();
  const [lookup, setLookup] = useState<Lookup>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  const present = useRef(true);
  const find = useCallback((instances: AgentInstance[]) => instances.find((item) => item.agentTypeId === agent.id) ?? null, [agent.id]);

  useEffect(() => {
    present.current = true;
    return () => { present.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetchInstances(userId).then(
      (instances) => { if (active) setLookup({ status: "ready", instance: find(instances) }); },
      () => { if (active) setLookup({ status: "error" }); },
    );
    return () => { active = false; };
  }, [userId, find, revision]);

  const assign = async () => {
    if (submitting.current || agent.status !== "Activo" || lookup.status !== "ready" || lookup.instance) return;
    submitting.current = true;
    onBusyChange(true);
    setMessage(null);
    try {
      // Revalidar antes del POST evita duplicar tras cambios externos o un reintento ambiguo.
      const existing = find(await fetchInstances(userId));
      if (!present.current) return;
      if (existing) { setLookup({ status: "ready", instance: existing }); return; }
      const created = await assignInstance({ userId, agentTypeId: agent.id, metadata: "{}" });
      if (!present.current) return;
      setLookup({ status: "ready", instance: created });
      setSaved(true);
      try {
        setLookup({ status: "ready", instance: find(await fetchInstances(userId)) ?? created });
      } catch {
        setMessage(t("Guardamos la asignación. Vuelve a seleccionar a la persona para consultar el estado actualizado."));
      }
    } catch {
      setMessage(t("No se pudo asignar el agente. Revisa los permisos o si ya está asignado e inténtalo de nuevo."));
    } finally {
      submitting.current = false;
      onBusyChange(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {lookup.status === "loading" && <Skeleton className="h-9 w-48" aria-label={t("Consultando asignación")} />}
      {lookup.status === "error" && <>
        <p role="alert" className="text-sm text-destructive">{t("No se pudo consultar la asignación. Reintenta antes de asignar.")}</p>
        <Button type="button" variant="outline" className="self-start" onClick={() => { setLookup({ status: "loading" }); setRevision((value) => value + 1); }}>{t("Reintentar")}</Button>
      </>}
      {lookup.status === "ready" && lookup.instance && <p role="status" className="text-sm">{saved ? t("Agente asignado a la cuenta vinculada de la persona.") : t("Esta persona ya tiene una asignación de este agente.")} {t("Estado")}: {t(lookup.instance.status)}</p>}
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <Button type="button" className="self-start" disabled={lookup.status !== "ready" || Boolean(lookup.instance)} onClick={assign}>{t("Asignar agente")}</Button>
    </div>
  );
}
