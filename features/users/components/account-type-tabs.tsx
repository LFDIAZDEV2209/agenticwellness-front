"use client";

import { HeartPulse, LayoutGrid, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/providers/i18n-provider";
import type { UserStats } from "../types";

export const accountSegments = ["erp", "patient", "all"] as const;

/**
 * Control segmentado del directorio (ERP / Pacientes / Todas). Base UI aporta
 * `tablist`/`tab`, roving tabIndex, flechas y Home/End. En 390 se desplaza en
 * horizontal con snap; el conteo forma parte del nombre accesible.
 */
export function AccountTypeTabs({ stats }: { stats: UserStats | null }) {
  const t = useT();
  const tabs = {
    erp: {
      label: t("Usuarios ERP"),
      count: stats?.erpTotal,
      icon: ShieldCheck,
    },
    patient: {
      label: t("Personas"),
      count: stats?.patientTotal,
      icon: HeartPulse,
    },
    all: {
      label: t("Todas las cuentas"),
      count: stats?.allTotal,
      icon: LayoutGrid,
    },
  };

  return (
    <div className="-mx-4 min-w-0 snap-x snap-mandatory overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <TabsList
        activateOnFocus
        aria-label={t("Tipo de cuenta")}
        className="max-w-none justify-start gap-1 rounded-full border border-border/60 bg-muted/40 p-1"
      >
        {accountSegments.map((value) => {
          const { label, count, icon: Icon } = tabs[value];
          return (
            <TabsTrigger
              key={value}
              value={value}
              className="group/account-tab h-11 flex-none snap-start rounded-full px-4 text-[13px] font-semibold data-active:bg-brand-gradient data-active:text-white data-active:shadow-sm sm:h-9"
            >
              <Icon aria-hidden="true" />
              {label}
              {count !== undefined ? (
                <span className="min-w-6 rounded-full bg-foreground/10 px-1.5 text-center text-xs leading-5 tabular-nums group-data-active/account-tab:bg-white/25">
                  {count}
                </span>
              ) : (
                <Skeleton aria-hidden="true" className="h-5 w-6 rounded-full" />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </div>
  );
}
