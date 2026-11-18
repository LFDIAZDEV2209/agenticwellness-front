"use client";

import Link from "next/link";
import {
  AlertCircle,
  Check,
  Clock3,
  FileClock,
  Pill,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/providers/i18n-provider";
import { useMedicationCapabilities } from "../hooks";
import type { DoseStatus, MedicationStatus } from "../types";

export function MedicationPatientLink({ patientId }: { patientId: string }) {
  const { canView } = useMedicationCapabilities();
  const t = useT();
  if (!canView) return null;
  return (
    <Link
      className={buttonVariants({ variant: "outline", size: "sm" })}
      href={`/medications/${encodeURIComponent(patientId)}`}
    >
      <Pill data-icon="inline-start" aria-hidden />
      {t("Control de medicamentos")}
    </Link>
  );
}

export function MedicationUnavailable() {
  const t = useT();
  const capabilities = useMedicationCapabilities();
  return (
    <section
      className="medication-empty rounded-2xl border border-border bg-card p-8"
      aria-labelledby="medication-unavailable-title"
    >
      <span className="medication-empty-icon">
        <ShieldCheck aria-hidden />
      </span>
      <h1 id="medication-unavailable-title">{t("Módulo no disponible")}</h1>
      <Button variant="outline" onClick={capabilities.retry}>
        <RefreshCw data-icon="inline-start" aria-hidden />
        {t("Volver a comprobar")}
      </Button>
    </section>
  );
}

export function MedicationLoading() {
  const t = useT();
  return (
    <div
      className="medication-loading"
      role="status"
      aria-label={t("Cargando medicamentos")}
    >
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <span className="sr-only">{t("Cargando medicamentos")}</span>
    </div>
  );
}

export function MedicationError({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const t = useT();
  return (
    <Alert variant="destructive" className="medication-error">
      <AlertCircle aria-hidden />
      <AlertDescription>{message}</AlertDescription>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry}>
          <RefreshCw data-icon="inline-start" aria-hidden />
          {t("Actualizar")}
        </Button>
      )}
    </Alert>
  );
}

export function MedicationEmpty({
  kind,
}: {
  kind: "patients" | "treatments" | "doses" | "history";
}) {
  const t = useT();
  const details = {
    patients: { icon: Pill, title: "No se encontraron pacientes" },
    treatments: { icon: Pill, title: "Sin tratamientos registrados" },
    doses: { icon: Clock3, title: "No hay tomas para este día" },
    history: { icon: FileClock, title: "Aún no hay registros de tomas" },
  }[kind];
  const Icon = details.icon;
  return (
    <div className="medication-empty">
      <span className="medication-empty-icon">
        <Icon aria-hidden />
      </span>
      <p>{t(details.title)}</p>
    </div>
  );
}

export function MedicationStatusBadge({
  status,
}: {
  status: MedicationStatus | DoseStatus;
}) {
  const t = useT();
  const label = {
    active: "Activo",
    paused: "Pausado",
    completed: "Finalizado",
    pending: "Pendiente",
    taken: "Tomado",
    omitted: "Omitido",
    cancelled: "Cancelado",
  }[status];
  const tone =
    status === "taken" || status === "active"
      ? "green"
      : status === "pending" || status === "paused"
        ? "amber"
        : "slate";
  return (
    <Badge variant="outline" tone={tone}>
      {status === "taken" ? <Check aria-hidden /> : null}
      {t(label)}
    </Badge>
  );
}
