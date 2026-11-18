"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api/http";
import { useAuth } from "@/providers/auth-provider";
import { useAppContext } from "@/providers/context-provider";
import { fetchMedicationCapabilities } from "./services";
import type { MedicationCapability } from "./types";

const unavailable: MedicationCapability = {
  enabled: false,
  canView: false,
  canManage: false,
  canManageAccess: false,
};
interface CapabilityState extends MedicationCapability {
  loading: boolean;
  scopeKey: string;
  retry: () => void;
}
const unavailableState: CapabilityState = {
  ...unavailable,
  loading: false,
  scopeKey: "",
  retry: () => {},
};
const CapabilityContext = createContext<CapabilityState>(unavailableState);

export function MedicationCapabilitiesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const { activeClinicId, loading: contextLoading, can } = useAppContext();
  const [revision, setRevision] = useState(0);
  const scopeKey = `${user?.id ?? ""}:${activeClinicId ?? ""}`;
  const allowed =
    !authLoading && !contextLoading && !!user && can("Medications.View");
  const [result, setResult] = useState<{
    key: string;
    revision: number;
    capability: MedicationCapability;
  }>();
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    fetchMedicationCapabilities(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({
            key: scopeKey,
            revision,
            capability: data.modules?.medications ?? unavailable,
          });
      },
      () => {
        if (!controller.signal.aborted)
          setResult({ key: scopeKey, revision, capability: unavailable });
      },
    );
    return () => controller.abort();
  }, [allowed, scopeKey, revision]);
  const current =
    allowed && result?.key === scopeKey ? result.capability : unavailable;
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!allowed) return;
    const revalidate = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    const timer = window.setInterval(revalidate, 30_000);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
      window.clearInterval(timer);
    };
  }, [allowed, retry]);
  const value = useMemo(
    () => ({
      enabled: current.enabled,
      canView: current.enabled && current.canView && can("Medications.View"),
      canManage:
        current.enabled && current.canManage && can("Medications.Manage"),
      canManageAccess:
        current.enabled &&
        current.canManageAccess &&
        can("Medications.ManageAccess"),
      loading: allowed && result?.key !== scopeKey,
      scopeKey,
      retry,
    }),
    [current, can, allowed, result, scopeKey, retry],
  );
  return (
    <CapabilityContext.Provider value={value}>
      {children}
    </CapabilityContext.Provider>
  );
}

export function useMedicationCapabilities() {
  return useContext(CapabilityContext);
}

/** El resultado solo existe para la sesión/clínica, consulta y revisión actuales. */
export function useMedicationResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  refreshKey = "",
) {
  const { canView, scopeKey } = useMedicationCapabilities();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    revision: number;
    load: typeof load;
    refreshKey: string;
    data?: T;
    error?: unknown;
  }>();
  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({ key: scopeKey, revision, load, refreshKey, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key: scopeKey, revision, load, refreshKey, error });
      },
    );
    return () => controller.abort();
  }, [canView, scopeKey, revision, load, refreshKey]);
  const current =
    canView &&
    result?.key === scopeKey &&
    result.revision === revision &&
    result.load === load &&
    result.refreshKey === refreshKey
      ? result
      : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: canView && !current,
    retry: () => setRevision((value) => value + 1),
  };
}

export function medicationErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "No tienes acceso a este paciente.";
    if (error.status === 404) return "El paciente no está disponible.";
    if (error.status === 409)
      return "El registro cambió. Actualiza e inténtalo de nuevo.";
    if (error.status === 400 || error.status === 422)
      return "Revisa los datos del tratamiento.";
  }
  return "No se pudo completar la operación. Inténtalo de nuevo.";
}
