"use client";

import { HeartPulse, LayoutGrid, ShieldCheck } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/providers/i18n-provider";
import type { UserStats } from "../types";

export const accountSegments = ["erp", "patient", "all"] as const;

export function AccountTypeTabs({ stats }: { stats: UserStats | null }) {
  const t = useT();
  const tabs = {
    erp: { label: t("Usuarios ERP"), count: stats?.erpTotal, icon: ShieldCheck },
    patient: { label: t("Pacientes"), count: stats?.patientTotal, icon: HeartPulse },
    all: { label: t("Todas las cuentas"), count: stats?.allTotal, icon: LayoutGrid },
  };

  return (
    <div className="min-w-0 max-w-full overflow-x-auto p-1 -m-1">
      <TabsList activateOnFocus aria-label={t("Tipo de cuenta")} className="max-w-none justify-start gap-1 rounded-full border-0 bg-muted/40">
        {accountSegments.map((value) => {
          const { label, count, icon: Icon } = tabs[value];
          return (
            <TabsTrigger key={value} value={value} className="group/account-tab rounded-full data-active:bg-brand-gradient data-active:text-white data-active:shadow-sm">
              <Icon aria-hidden="true" />
              {label}
              {count !== undefined && (
                <span className="rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums group-data-active/account-tab:bg-white/20">
                  {count}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </div>
  );
}
