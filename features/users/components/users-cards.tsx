"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Clock,
  Eye,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";
import type { User } from "../types";
import { formatDate, getAccountType, getFullName } from "../services/users-service";
import { formatRelativeTime } from "../services/users-mock";
import { getDirectoryUserHref, PatientDirectoryAccess, RoleChips, UserAvatar, UserIdentity, UserStatusBadge } from "./user-visuals";

interface UsersCardsProps {
  users: User[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onToggleActive: (user: User) => void;
  onDelete: (user: User) => void;
  onPermissions: (user: User) => void;
}

/**
 * Card de usuario — espejo compacto de la tabla:
 * - avatar con anillo de estado (verde activo / pizarra inactivo),
 * - identidad + roles,
 * - meta en dos columnas (estado, último acceso, creado).
 */
export function UsersCards({
  users,
  selectedIds,
  onToggleSelect,
  onView,
  onEdit,
  onToggleActive,
  onDelete,
  onPermissions,
}: UsersCardsProps) {
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission("Users.Update");
  const canDelete = hasPermission("Users.Delete");
  const canAssignPermissions = hasPermission("Permissions.Assign");
  const t = useT();

  return (
    <div className="stagger-children grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {users.map((user) => {
        const selected = selectedIds.has(user.id);
        const isPatient = getAccountType(user) === "patient";
        const name = getFullName(user) || t("Sin nombre");
        return (
          <article
            key={user.id}
            data-selected={selected}
            className={cn(
              "group relative flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-navy/10",
              selected
                ? "border-primary ring-2 ring-primary/25"
                : "border-border/70 hover:border-primary/40",
            )}
          >
            {/* Cabecera: selección + identidad + menú */}
            <div className="flex items-start gap-3">
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect(user.id)}
                aria-label={t("Seleccionar {name}", { name })}
                className="mt-1.5"
              />
              <Link
                href={getDirectoryUserHref(user)}
                className="group/id flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:bg-muted/50"
              >
                <span className="relative shrink-0">
                  <UserAvatar
                    user={user}
                    className={cn(
                      "size-10",
                      user.isActive
                        ? "ring-2 ring-success/60"
                        : "ring-2 ring-slate-300",
                    )}
                  />
                  <span
                    className={cn(
                      "absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-white",
                      user.isActive ? "bg-success" : "bg-slate-400",
                    )}
                    aria-hidden
                  />
                </span>
                <UserIdentity user={user} />
              </Link>
              {(isPatient || canUpdate || canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="flex size-7 items-center justify-center rounded-md opacity-60 transition-all hover:bg-muted hover:opacity-100 group-hover:opacity-100"
                    aria-label={t("Acciones de {name}", {
                      name,
                    })}
                  >
                    <MoreHorizontal className="size-4 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => onView(user)}>
                      <Eye className="size-4" />
                      {isPatient ? t("Ver cuenta") : t("Ver usuario")}
                    </DropdownMenuItem>
                    {isPatient && user.patient && (
                      <DropdownMenuItem render={<Link href={getDirectoryUserHref(user)} />}>
                        <ArrowUpRight className="size-4" />
                        {t("Abrir ficha")}
                      </DropdownMenuItem>
                    )}
                    {canUpdate && (
                      <DropdownMenuItem onClick={() => onEdit(user)}>
                        <Pencil className="size-4" />
                        {isPatient ? t("Editar cuenta") : t("Editar")}
                      </DropdownMenuItem>
                    )}
                    {canUpdate && (
                      <>
                        <DropdownMenuSeparator />
                        {user.isActive ? (
                          <DropdownMenuItem
                            onClick={() => onToggleActive(user)}
                          >
                            <UserX className="size-4" />
                            {t("Desactivar")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => onToggleActive(user)}
                          >
                            <UserCheck className="size-4" />
                            {t("Activar")}
                          </DropdownMenuItem>
                        )}
                        {!isPatient && canAssignPermissions && (
                          <DropdownMenuItem
                            onClick={() => onPermissions(user)}
                          >
                            <ShieldCheck className="size-4" />
                            {t("Permisos")}
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    {canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDelete(user)}
                        >
                          <Trash2 className="size-4" />
                          {t("Eliminar")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Roles */}
            {isPatient ? <PatientDirectoryAccess user={user} /> : <RoleChips roles={user.roles} scopedRoles={user.scopedRoles} max={3} />}

            {/* Meta: estado + fechas */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-muted/40 p-2.5">
              <div className="flex flex-col gap-1">
                <span className="text-[9.5px] font-bold tracking-wider text-muted-foreground uppercase">
                  {t("Estado")}
                </span>
                <UserStatusBadge isActive={user.isActive} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-[9.5px] font-bold tracking-wider text-muted-foreground uppercase">
                  <Clock className="size-2.5" />
                  {t("Último acceso")}
                </span>
                <span className="text-[11.5px] font-medium text-foreground">
                  {user.lastAccessAt
                    ? formatRelativeTime(Date.parse(user.lastAccessAt))
                    : t("No disponible")}
                </span>
              </div>
              <div className="col-span-2 flex flex-col gap-1 border-t border-border/50 pt-2">
                <span className="flex items-center gap-1 text-[9.5px] font-bold tracking-wider text-muted-foreground uppercase">
                  <CalendarDays className="size-2.5" />
                  {t("Fecha de creación")}
                </span>
                <span className="text-[11.5px] font-medium text-foreground">
                  {formatDate(user.createdAt)}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
