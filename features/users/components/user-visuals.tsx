"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Info, ShieldAlert, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { rainbowStyle } from "@/lib/ui/rainbow";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";
import { getAccountType, getFullName, getInitials } from "../services/users-service";
import type { User, ScopedUserRole } from "../types";

/**
 * Visuales compartidos del módulo de usuarios (tabla, cards, detalle):
 * avatar con el gradiente de marca, badge de estado con icono + texto
 * (nunca solo color) y chips de roles.
 */

/** Avatar del usuario con gradiente de marca (consistente con el dashboard). */
export function UserAvatar({
  user,
  className,
}: {
  user: Pick<User, "firstName" | "lastName">;
  className?: string;
}) {
  return (
    <Avatar className={cn("border-2 border-white shadow-sm", className)}>
      <AvatarFallback className="bg-gradient-to-br from-[var(--sidebar)] to-brand-teal text-[11px] font-bold text-white">
        {getInitials(user)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Badge semántico con superficie suave y contraste AA en ambos temas.
 * Activo conserva verde; inactivo conserva pizarra. Siempre icono + texto.
 */
export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  const t = useT();
  return isActive ? (
    <span
      className="spectrum-tag inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] leading-4 font-semibold"
      style={rainbowStyle("green")}
    >
      <CheckCircle2 className="size-3.5" />
      {t("Activo")}
    </span>
  ) : (
    <span
      className="spectrum-tag inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] leading-4 font-semibold"
      style={rainbowStyle("slate")}
    >
      <XCircle className="size-3.5" />
      {t("Inactivo")}
    </span>
  );
}

/** Chips de roles (globales + scoped) con icono; muestra "+N" si hay más. */
export function RoleChips({
  roles,
  scopedRoles,
  max = 2,
  className,
}: {
  roles: string[];
  scopedRoles?: ScopedUserRole[] | null;
  max?: number;
  className?: string;
}) {
  const t = useT();

  // Combinar roles globales y scoped en una lista unificada para el display.
  const allChips: { label: string; scoped: boolean }[] = [];

  for (const role of roles) {
    allChips.push({ label: role, scoped: false });
  }
  if (scopedRoles) {
    for (const sr of scopedRoles) {
      const label = sr.scopeName
        ? `${sr.roleName} · ${sr.scopeName}`
        : sr.roleName;
      allChips.push({ label, scoped: true });
    }
  }

  const visible = allChips.slice(0, max);
  const extra = allChips.length - visible.length;
  const hasNoRoles = allChips.length === 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {hasNoRoles && (
        <span
          className="spectrum-tag inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
          style={rainbowStyle("amber")}
        >
          <ShieldAlert className="size-3" />
          {t("Sin roles")}
        </span>
      )}
      {visible.map((chip) =>
        chip.scoped ? (
          <span
            key={chip.label}
            className="spectrum-tag inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={rainbowStyle("teal")}
          >
            <ShieldCheck className="size-3" />
            {chip.label}
          </span>
        ) : (
          <span
            key={chip.label}
            className="spectrum-tag inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={rainbowStyle("violet")}
          >
            <ShieldCheck className="size-3" />
            {chip.label}
          </span>
        ),
      )}
      {extra > 0 && (
        <span className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}

export function getDirectoryUserHref(user: User) {
  return getAccountType(user) === "patient" && user.patient
    ? `/patients/${user.patient.id}`
    : `/users/${user.id}`;
}

export function AccountTypeBadge({ user }: { user: User }) {
  const t = useT();
  const isErp = getAccountType(user) === "erp";
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {isErp && (
        <span className="rounded-full bg-brand-navy px-2 py-0.5 text-[11px] font-semibold text-white">
          {t("ERP")}
        </span>
      )}
      {(!isErp || user.applications?.includes("app")) && (
        <span className="spectrum-tag rounded-full px-2 py-0.5 text-[11px] font-semibold" style={rainbowStyle("teal")}>
          {t("App")}
        </span>
      )}
    </span>
  );
}

export function MobileAccessBadge() {
  const t = useT();
  return (
    <span className="spectrum-tag inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={rainbowStyle("teal")}>
      <Smartphone aria-hidden="true" className="size-3.5" />
      {t("App móvil")}
    </span>
  );
}

export function PatientDirectoryAccess({ user }: { user: User }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {user.patient?.documentNumber && <span className="text-xs tabular-nums">{t("ID {document}", { document: user.patient.documentNumber })}</span>}
      <MobileAccessBadge />
    </div>
  );
}

export function PatientAccessNotice() {
  const t = useT();
  return (
    <div className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2.5 text-sm text-info-soft-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{t("Esta cuenta solo accede a la app móvil. Los roles y permisos del ERP no se aplican.")}</p>
    </div>
  );
}

export function OpenPatientProfile({ patient }: { patient: NonNullable<User["patient"]> }) {
  const t = useT();
  return (
    <Link href={`/patients/${patient.id}`} className={buttonVariants({ variant: "outline", className: "w-fit" })}>
      {t("Abrir ficha del paciente")}
      <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
    </Link>
  );
}

/** Identidad y medio de contacto de la cuenta. */
export function UserIdentity({
  user,
  emailClassName,
}: {
  user: User;
  emailClassName?: string;
}) {
  const t = useT();
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
        <span className="truncate text-[13px] font-semibold text-foreground">
          {getFullName(user) || t("Sin nombre")}
        </span>
        <AccountTypeBadge user={user} />
      </div>
      <span
        className={cn(
          "truncate text-[11px] text-muted-foreground",
          emailClassName,
        )}
      >
        {user.email || user.phoneNumber || t("Sin correo")}
      </span>
      {!user.email && user.phoneNumber && (
        <span className="text-[11px] text-muted-foreground">{t("Sin correo")}</span>
      )}
    </div>
  );
}
