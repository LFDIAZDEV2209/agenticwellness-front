"use client";
import { CalendarDays, Package, Bell, ShieldCheck } from "lucide-react";
import { useT } from "@/providers/i18n-provider";
import { useMedicationCapabilities } from "../hooks";
import { MedicationLoading, MedicationUnavailable } from "./medication-shared";
import { MedicationModuleNav } from "./medication-module-nav";
import { MedicationTracking } from "./medication-tracking";
import { MedicationInventory } from "./medication-inventory";
import { MedicationAlerts } from "./medication-alerts";
import { MedicationAuditLog } from "./medication-audit";
import "../medications.css";
export function MedicationMonitoringPage({
  view,
}: {
  view: "tracking" | "inventory" | "alerts" | "audit";
}) {
  const t = useT(),
    cap = useMedicationCapabilities();
  const pages = {
    tracking: { title: "Seguimiento diario", icon: CalendarDays },
    inventory: { title: "Inventario global", icon: Package },
    alerts: { title: "Alertas", icon: Bell },
    audit: { title: "Auditoría", icon: ShieldCheck },
  };
  const { title, icon: Icon } = pages[view];
  if (cap.loading)
    return (
      <div className="medication-page">
        <MedicationLoading />
      </div>
    );
  if (!cap.canView || (view === "audit" && !cap.canViewAudit))
    return (
      <div className="medication-page">
        <MedicationUnavailable />
      </div>
    );
  return (
    <div
      className="medication-page medication-monitoring-page"
      key={cap.scopeKey}
    >
      <header className="medication-home-header">
        <div className="medication-home-title">
          <span className="medication-home-title-icon">
            <Icon aria-hidden />
          </span>
          <div>
            <h1>{t(title)}</h1>
          </div>
        </div>
      </header>
      <MedicationModuleNav current={view} />
      {view === "tracking" ? (
        <MedicationTracking />
      ) : view === "inventory" ? (
        <MedicationInventory />
      ) : view === "alerts" ? (
        <MedicationAlerts />
      ) : (
        <MedicationAuditLog />
      )}
    </div>
  );
}
