"use client";
import Link from "next/link";
import {
  LayoutDashboard,
  UsersRound,
  CalendarDays,
  Package,
  Bell,
  ShieldCheck,
} from "lucide-react";
import { useT } from "@/providers/i18n-provider";
import { useMedicationCapabilities } from "../hooks";

export function MedicationModuleNav({
  current,
  onHome,
  onPatients,
}: {
  current: string;
  onHome?: () => void;
  onPatients?: () => void;
}) {
  const t = useT(),
    cap = useMedicationCapabilities();
  const items = [
    {
      key: "overview",
      href: "/medications",
      label: "Inicio",
      icon: LayoutDashboard,
      click: onHome,
    },
    {
      key: "patients",
      href: "/medications?view=patients",
      label: "Pacientes",
      icon: UsersRound,
      click: onPatients,
    },
    {
      key: "tracking",
      href: "/medications/tracking",
      label: "Seguimiento diario",
      icon: CalendarDays,
    },
    {
      key: "inventory",
      href: "/medications/inventory",
      label: "Inventario global",
      icon: Package,
    },
    {
      key: "alerts",
      href: "/medications/alerts",
      label: "Alertas",
      icon: Bell,
    },
    ...(cap.canViewAudit
      ? [
          {
            key: "audit",
            href: "/medications/audit",
            label: "Auditoría",
            icon: ShieldCheck,
          },
        ]
      : []),
  ];
  return (
    <nav
      className="medication-home-nav"
      aria-label={t("Vistas de medicamentos")}
    >
      {items.map(({ key, href, label, icon: Icon, click }) =>
        click ? (
          <button
            type="button"
            key={key}
            aria-pressed={current === key}
            onClick={click}
          >
            <Icon aria-hidden />
            {t(label)}
          </button>
        ) : (
          <Link
            key={key}
            href={href}
            aria-current={current === key ? "page" : undefined}
          >
            <Icon aria-hidden />
            {t(label)}
          </Link>
        ),
      )}
    </nav>
  );
}
