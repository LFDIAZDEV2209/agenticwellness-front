"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  HeartPulse,
  LayoutGrid,
  ShieldCheck,
  Info,
  LoaderCircle,
  Plus,
  RefreshCw,
  SearchX,
  Trash2,
  Upload,
  Users as UsersIcon,
  UserX,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/providers/auth-provider";
import type { Permission } from "@/features/permissions/types";
import type { Role } from "@/features/roles/types";
import { useUsers } from "../hooks/use-users";
import {
  deleteUser,
  fetchPermissions,
  fetchRoles,
  fetchUserRoles,
  fetchUserStats,
  getAccountType,
  getFullName,
  updateUser,
} from "../services/users-service";
import type { User, UserStats, UsersFilters } from "../types";
import type { DataView } from "@/components/feedback/view-toggle";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { UsersStats } from "./users-stats";
import { UsersToolbar } from "./users-toolbar";
import { UsersTable } from "./users-table";
import { UsersCards } from "./users-cards";
import { BulkRolesProvider, UsersBulkBar } from "./users-bulk-bar";
import { UserPermissionsDialog } from "./user-permissions-dialog";
import { AccountTypeTabs, accountSegments } from "./account-type-tabs";
import { parseSegmentQuery, segmentQueryValues } from "./user-visuals";
import { useT } from "@/providers/i18n-provider";

/** Bajo 640px la vista por defecto es tarjetas (la tabla no cabe en 390). */
const NARROW_QUERY = "(max-width: 639px)";

function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Copy del encabezado y de los conteos por segmento (claves i18n). */
const segmentCopy = {
  erp: {
    description:
      "Gestiona el personal con acceso al ERP, sus roles y permisos.",
    one: "{count} usuario ERP encontrado",
    many: "{count} usuarios ERP encontrados",
    icon: ShieldCheck,
  },
  patient: {
    description: "Cuentas de personas que usan la app móvil.",
    one: "{count} persona encontrada",
    many: "{count} personas encontradas",
    icon: HeartPulse,
  },
  all: {
    description:
      "Todas las cuentas de la plataforma, de personal y de personas.",
    one: "{count} cuenta encontrada",
    many: "{count} cuentas encontradas",
    icon: LayoutGrid,
  },
} as const;

/**
 * Página de usuarios: stats accionables + filtros reales + tabla/cards con
 * ordenamiento + acciones masivas + paginación. La creación/edición vive en
 * rutas dedicadas (/users/nuevo, /users/{id}/editar) y el detalle en
 * /users/{id}.
 */
export function UsersPageContent() {
  const { user: session, hasPermission, logout } = useAuth();
  const canCreate = hasPermission("Users.Create");
  const canUpdate = hasPermission("Users.Update");
  const canDelete = hasPermission("Users.Delete");
  const canAssignRoles = hasPermission("Roles.Assign");
  const t = useT();
  const router = useRouter();

  const {
    result,
    loading,
    error,
    filters,
    sort,
    selectedIds,
    setFilters,
    setSort,
    setPage,
    setPageSize,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    refetch,
    retry,
  } = useUsers();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isNarrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
  const [viewChoice, setView] = useState<DataView | null>(null);
  const view: DataView = viewChoice ?? (isNarrow ? "cards" : "table");
  const [contextDismissed, setContextDismissed] = useState(false);
  const [stats, setStats] = useState<{
    segment: UsersFilters["accountType"];
    data: UserStats;
  } | null>(null);
  const [statsRevision, setStatsRevision] = useState(0);
  const [catalog, setCatalog] = useState<{
    roles: Role[];
    permissions: Permission[];
  } | null>(null);
  const [deleting, setDeleting] = useState<User | undefined>();
  const [permissionsUser, setPermissionsUser] = useState<User | undefined>();
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);

  // Catálogo de roles/permisos: alimenta el filtro por rol y la barra masiva.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRoles(), fetchPermissions()])
      .then(([roles, permissions]) => {
        if (!cancelled) setCatalog({ roles, permissions });
      })
      .catch(() => {
        // El filtro por rol queda vacío; el resto del módulo sigue funcionando.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStats = () => setStatsRevision((revision) => revision + 1);
  const segment = filters.accountType;
  const segmentStats = stats?.segment === segment ? stats.data : null;
  const canBulkAssignRoles =
    canAssignRoles &&
    segment !== "patient" &&
    !result?.data.some(
      (user) => selectedIds.has(user.id) && getAccountType(user) === "patient",
    );

  useEffect(() => {
    const controller = new AbortController();
    fetchUserStats(segment, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setStats({ segment, data });
      })
      .catch(() => {
        // Sin stats la lista sigue funcionando.
      });
    return () => controller.abort();
  }, [segment, statsRevision]);

  const roleNames = (catalog?.roles ?? []).map((role) => role.name);
  const deletingPatient = deleting
    ? getAccountType(deleting) === "patient"
    : false;
  const countLabel = (total: number) =>
    t(total === 1 ? segmentCopy[segment].one : segmentCopy[segment].many, {
      count: String(total),
    });

  const dismissNotice = useCallback(() => setNotice(null), []);

  const changeSegment = (value: unknown) => {
    const next = accountSegments.find((item) => item === value);
    if (!next || next === segment) return;
    setPermissionsUser(undefined);
    // Conserva búsqueda, estado y fecha; el filtro por rol no aplica entre segmentos.
    setFilters({ accountType: next, role: "all" });
    const params = new URLSearchParams(searchParams.toString());
    if (next === "erp") params.delete("cuentas");
    else params.set("cuentas", segmentQueryValues[next]);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  // `?cuentas=` permite enlaces profundos y volver/avanzar con el navegador.
  const querySegment = parseSegmentQuery(searchParams.get("cuentas")) ?? "erp";
  useEffect(() => {
    if (querySegment !== segment)
      setFilters({ accountType: querySegment, role: "all" });
    // Solo reacciona a la URL; el clic en una tab ya actualizó el filtro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [querySegment]);

  const openPermissions = (user: User) => {
    if (getAccountType(user) === "erp") setPermissionsUser(user);
  };

  // --- Acciones individuales ---

  const toggleActive = async (user: User) => {
    setNotice(null);
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      if (session?.id === user.id && user.isActive) {
        // Desactivarse a sí mismo invalida la sesión (security stamp del backend).
        setNotice({
          tone: "info",
          text: t(
            "Te desactivaste: la sesión se cerrará para aplicar el cambio.",
          ),
        });
        setTimeout(() => logout("expired"), 1200);
        return;
      }
      const patientAccount = getAccountType(user) === "patient";
      setNotice({
        tone: "info",
        text: !user.isActive
          ? patientAccount
            ? t("Cuenta activada. La persona ya puede entrar a la app.")
            : t("Usuario activado. Ya puede iniciar sesión.")
          : patientAccount
            ? t("Cuenta desactivada. La persona no podrá entrar a la app.")
            : t(
                "Usuario desactivado. No podrá iniciar sesión hasta reactivarlo.",
              ),
      });
      await refetch();
      refreshStats();
    } catch (err) {
      setNotice({
        tone: "error",
        text:
          err instanceof Error ? err.message : t("Error al cambiar el estado."),
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteSaving(true);
    try {
      await deleteUser(deleting.id);
      setDeleting(undefined);
      clearSelection();
      await refetch();
      refreshStats();
    } catch (err) {
      setNotice({
        tone: "error",
        text:
          err instanceof Error
            ? err.message
            : t("Error al eliminar el usuario."),
      });
      setDeleting(undefined);
    } finally {
      setDeleteSaving(false);
    }
  };

  // --- Acciones masivas (reales, sobre la API existente) ---

  const bulkSetActive = async (active: boolean) => {
    setBulkBusy(true);
    setNotice(null);
    let done = 0;
    let failed = 0;
    let selfSkipped = 0;
    for (const id of selectedIds) {
      if (id === session?.id) {
        selfSkipped++;
        continue;
      }
      try {
        await updateUser(id, { isActive: active });
        done++;
      } catch {
        failed++;
      }
    }
    clearSelection();
    await refetch();
    refreshStats();
    setBulkBusy(false);
    const parts: string[] = [
      `${done} ${done === 1 ? t("usuario actualizado") : t("usuarios actualizados")}`,
    ];
    if (failed > 0) parts.push(`${failed} ${t("con error")}`);
    if (selfSkipped > 0)
      parts.push(
        `${selfSkipped} ${t("omitido(s): no puedes cambiar tu propio estado")}`,
      );
    setNotice({ tone: failed > 0 ? "error" : "info", text: parts.join(" · ") });
  };

  const bulkAssignRole = async (roleId: string) => {
    if (!canBulkAssignRoles || !selectedIds.size) return;
    setBulkBusy(true);
    setNotice(null);
    let done = 0;
    let failed = 0;
    const roleName =
      catalog?.roles.find((role) => role.id === roleId)?.name ?? "";
    for (const id of selectedIds) {
      try {
        // El backend hace sync TOTAL: primero leemos los roles actuales para
        // AGREGAR el nuevo sin perder los existentes.
        const current = await fetchUserRoles(id);
        if (current.some((role) => role.id === roleId)) {
          done++;
          continue;
        }
        await updateUser(id, {
          roleIds: [...current.map((role) => role.id), roleId],
        });
        done++;
      } catch {
        failed++;
      }
    }
    clearSelection();
    await refetch();
    refreshStats();
    setBulkBusy(false);
    setNotice({
      tone: failed > 0 ? "error" : "info",
      text:
        failed > 0
          ? `${done} ${t("asignados")} · ${failed} ${t("con error")}`
          : `${t("Rol")} "${roleName}" ${t("asignado a")} ${done} ${done === 1 ? t("usuario") : t("usuarios")}`,
    });
  };

  const bulkDelete = async () => {
    setBulkBusy(true);
    setNotice(null);
    let done = 0;
    let failed = 0;
    let selfSkipped = 0;
    for (const id of selectedIds) {
      if (id === session?.id) {
        selfSkipped++;
        continue;
      }
      try {
        await deleteUser(id);
        done++;
      } catch {
        failed++;
      }
    }
    clearSelection();
    await refetch();
    refreshStats();
    setBulkBusy(false);
    const parts: string[] = [
      `${done} ${done === 1 ? t("usuario eliminado") : t("usuarios eliminados")}`,
    ];
    if (failed > 0) parts.push(`${failed} ${t("con error")}`);
    if (selfSkipped > 0)
      parts.push(`${selfSkipped} ${t("omitido(s): eres tú")}`);
    setNotice({ tone: failed > 0 ? "error" : "info", text: parts.join(" · ") });
  };

  return (
    <BulkRolesProvider roles={catalog?.roles ?? []}>
      <Tabs
        value={segment}
        onValueChange={changeSegment}
        className="min-w-0 gap-5 p-4 sm:p-6"
      >
        <PageHeader
          title={t("Usuarios y cuentas")}
          description={t(segmentCopy[segment].description)}
          icon={UsersIcon}
          actions={
            segment === "patient" ? (
              <Link
                href="/patients"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <HeartPulse data-icon="inline-start" />
                {t("Ir a Personas")}
                <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            ) : (
              canCreate && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/people/importar?from=/users")}
                    title={t("Crear usuarios masivamente")}
                    aria-label={t("Importar masivamente")}
                  >
                    <Upload data-icon="inline-start" />
                    <span className="hidden sm:inline">
                      {t("Importar masivamente")}
                    </span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => router.push("/people/new")}
                    className="bg-brand-gradient text-white shadow-md shadow-brand-navy/25 transition-all hover:opacity-95 hover:shadow-lg motion-safe:hover:-translate-y-0.5"
                  >
                    <Plus data-icon="inline-start" />
                    {t("Nuevo usuario")}
                  </Button>
                </div>
              )
            )
          }
        />

        <AccountTypeTabs stats={stats?.data ?? null} />
        <TabsContent
          key={segment}
          value={segment}
          className="flex min-w-0 flex-col gap-5"
          tabIndex={0}
        >
          <UsersStats
            stats={segmentStats}
            filters={filters}
            onStatFilter={setFilters}
          />

          <UsersToolbar
            filters={filters}
            roles={roleNames}
            view={view}
            onViewChange={setView}
            onFilterChange={setFilters}
          />

          {segment === "patient" && !contextDismissed && (
            <div className={noticeInfoClass} role="note">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">
                {t(
                  "Estas cuentas solo acceden a la app móvil. Los roles y permisos del ERP no aplican.",
                )}
              </span>
              <button
                type="button"
                onClick={() => setContextDismissed(true)}
                className="-my-1 rounded-md px-2 py-1 text-xs font-medium underline-offset-2 hover:underline"
              >
                {t("Entendido")}
              </button>
            </div>
          )}

          {notice && (
            <div
              className={
                notice.tone === "error" ? noticeErrorClass : noticeInfoClass
              }
              role={notice.tone === "error" ? "alert" : "status"}
            >
              {notice.tone === "error" ? (
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              ) : (
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              <span className="flex-1">{notice.text}</span>
              <button
                type="button"
                onClick={dismissNotice}
                className="-my-1 rounded-md px-2 py-1 text-xs font-medium underline-offset-2 hover:underline"
              >
                {t("Cerrar")}
              </button>
            </div>
          )}

          {/* Conteo anunciado a lectores de pantalla al cambiar de segmento o filtro. */}
          <p className="sr-only" aria-live="polite">
            {!loading && result ? countLabel(result.total) : ""}
          </p>

          {loading ? (
            <UsersTableSkeleton />
          ) : error ? (
            <UsersErrorState message={error} onRetry={retry} />
          ) : result && result.data.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-brand-blue-soft/40 bg-card shadow-xs">
              <SectionHeader
                title={countLabel(result.total)}
                icon={segmentCopy[segment].icon}
                variant="primary"
                actions={
                  selectedIds.size > 0 ? (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="rounded-md px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {t("Limpiar selección")}
                    </button>
                  ) : undefined
                }
              />
              {view === "table" ? (
                <UsersTable
                  users={result.data}
                  segment={segment}
                  selectedIds={selectedIds}
                  sort={sort}
                  onSortChange={setSort}
                  onToggleSelect={toggleSelect}
                  onToggleSelectAll={toggleSelectAll}
                  onView={(user) => router.push(`/users/${user.id}`)}
                  onEdit={(user) => router.push(`/users/${user.id}/editar`)}
                  onToggleActive={(user) => void toggleActive(user)}
                  onDelete={setDeleting}
                  onPermissions={openPermissions}
                />
              ) : (
                <UsersCards
                  users={result.data}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onView={(user) => router.push(`/users/${user.id}`)}
                  onEdit={(user) => router.push(`/users/${user.id}/editar`)}
                  onToggleActive={(user) => void toggleActive(user)}
                  onDelete={setDeleting}
                  onPermissions={openPermissions}
                />
              )}
            </div>
          ) : (
            <EmptyState
              segment={segment}
              hasFilters={
                Boolean(filters.search) ||
                filters.status !== "all" ||
                filters.role !== "all" ||
                filters.createdWithin !== "all"
              }
              onCreate={() => router.push("/people/new?mode=user")}
              onSearchAll={() => changeSegment("all")}
              searchQuery={filters.search.trim()}
              onClearFilters={() =>
                setFilters({
                  search: "",
                  status: "all",
                  role: "all",
                  createdWithin: "all",
                })
              }
              canCreate={canCreate && segment !== "patient"}
            />
          )}

          {result && result.totalPages > 1 && (
            <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
              <span>
                {t("Página {page} de {totalPages}", {
                  page: String(result.page),
                  totalPages: String(result.totalPages),
                })}{" "}
                · {result.total}{" "}
                {segment === "patient"
                  ? result.total === 1
                    ? t("paciente")
                    : t("pacientes")
                  : segment === "all"
                    ? result.total === 1
                      ? t("cuenta")
                      : t("cuentas")
                    : result.total === 1
                      ? t("usuario")
                      : t("usuarios")}
              </span>
              <div className="flex items-center gap-3">
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={result.pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  aria-label={t("Usuarios por página")}
                >
                  <option value={5}>{t("5 por página")}</option>
                  <option value={10}>{t("10 por página")}</option>
                  <option value={20}>{t("20 por página")}</option>
                </select>
                <Pagination className="w-auto justify-start">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        text={t("Anterior")}
                        aria-label={t("Página anterior")}
                        aria-disabled={result.page === 1}
                        className={
                          result.page === 1
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(result.page - 1);
                        }}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        text={t("Siguiente")}
                        aria-label={t("Página siguiente")}
                        aria-disabled={result.page === result.totalPages}
                        className={
                          result.page === result.totalPages
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(result.page + 1);
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          )}

          {/* Barra de acciones masivas */}
          <UsersBulkBar
            selectedCount={selectedIds.size}
            busy={bulkBusy}
            onClear={clearSelection}
            onAssignRole={bulkAssignRole}
            onSetActive={bulkSetActive}
            onDelete={bulkDelete}
            canAssignRoles={canBulkAssignRoles}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        </TabsContent>

        {/* Confirmación de eliminación individual */}
        <AlertDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => !open && setDeleting(undefined)}
        >
          <AlertDialogContent className="sm:max-w-md!">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive-soft text-destructive">
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {deletingPatient
                  ? t("¿Eliminar cuenta?")
                  : t("¿Eliminar usuario?")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deletingPatient
                  ? t("Se eliminará la cuenta de")
                  : t("Se eliminará el usuario")}
                {deleting
                  ? ` "${getFullName(deleting) || t("Sin nombre")}"`
                  : ""}{" "}
                {deletingPatient
                  ? t(
                      "y su acceso a la app móvil. La ficha de la persona y su historial de salud se conservan. Esta acción es irreversible.",
                    )
                  : t(
                      "y todas sus asignaciones. El perfil del directorio y el historial clínico se conservan. Esta acción no se puede deshacer.",
                    )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteSaving}>
                {t("Cancelar")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteSaving}
                onClick={confirmDelete}
              >
                {deleteSaving ? (
                  <LoaderCircle
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <Trash2 data-icon="inline-start" />
                )}
                {t("Eliminar")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Diálogo de permisos directos del usuario */}
        {segment !== "patient" &&
          permissionsUser &&
          getAccountType(permissionsUser) === "erp" && (
            <UserPermissionsDialog
              userId={permissionsUser.id}
              userName={getFullName(permissionsUser) || t("Sin nombre")}
              roles={permissionsUser.roles}
              open={Boolean(permissionsUser)}
              onOpenChange={(open) => {
                if (!open) setPermissionsUser(undefined);
              }}
            />
          )}
      </Tabs>
    </BulkRolesProvider>
  );
}

const noticeInfoClass =
  "flex items-start gap-2 rounded-xl border border-info-soft bg-info-soft px-4 py-3 text-sm text-info-soft-foreground";
const noticeErrorClass =
  "flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive-soft px-4 py-3 text-sm text-destructive";

function UsersTableSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <div className="size-4 animate-pulse rounded bg-muted" />
          <div className="size-8 animate-pulse rounded-full bg-muted" />
          <div className="flex flex-1 flex-col gap-1">
            <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-5 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function UsersErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive-soft/40 py-14 text-center">
      <p className="text-sm font-semibold text-destructive">
        {t("No pudimos cargar los usuarios")}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw data-icon="inline-start" />
        {t("Reintentar")}
      </Button>
    </div>
  );
}

function EmptyState({
  segment,
  hasFilters,
  onCreate,
  onSearchAll,
  searchQuery,
  onClearFilters,
  canCreate,
}: {
  segment: UsersFilters["accountType"];
  hasFilters: boolean;
  onCreate: () => void;
  onSearchAll: () => void;
  searchQuery: string;
  onClearFilters: () => void;
  canCreate: boolean;
}) {
  const t = useT();
  const isFilterIssue = hasFilters;
  const segmentName = {
    erp: t("Usuarios ERP"),
    patient: t("Personas"),
    all: t("Todas las cuentas"),
  }[segment];

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card px-4 py-14 sm:py-16">
      <div
        className={
          isFilterIssue
            ? "flex size-12 items-center justify-center rounded-xl bg-warning-soft text-warning-soft-foreground"
            : "flex size-12 items-center justify-center rounded-xl bg-muted"
        }
      >
        {isFilterIssue ? (
          <SearchX aria-hidden="true" className="size-6" />
        ) : (
          <UserX aria-hidden="true" className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="max-w-md text-center">
        <h3 className="text-sm font-semibold text-foreground">
          {isFilterIssue
            ? searchQuery
              ? t("Ningún resultado para «{query}» en {segment}", {
                  query: searchQuery,
                  segment: segmentName,
                })
              : t("Sin resultados para estos filtros")
            : segment === "patient"
              ? t("Aún no hay personas con cuenta")
              : segment === "erp"
                ? t("Aún no hay usuarios del ERP")
                : t("No hay cuentas registradas")}
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {isFilterIssue
            ? t("Prueba ajustar o limpiar los filtros de búsqueda.")
            : segment === "patient"
              ? t("Aparecerán aquí cuando se registren en la app móvil.")
              : t("Crea el primero o importa varios a la vez.")}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {isFilterIssue ? (
          <Button size="sm" variant="outline" onClick={onClearFilters}>
            {t("Limpiar filtros")}
          </Button>
        ) : null}
        {isFilterIssue && segment !== "all" ? (
          <Button size="sm" variant="ghost" onClick={onSearchAll}>
            {t("Buscar en todas las cuentas")}
          </Button>
        ) : null}
        {!isFilterIssue && segment === "patient" ? (
          <Link
            href="/patients"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("Ir a Personas")}
          </Link>
        ) : null}
        {canCreate && (
          <Button
            size="sm"
            onClick={onCreate}
            className="bg-brand-gradient text-white hover:opacity-95"
          >
            <Plus data-icon="inline-start" />
            {t("Nuevo usuario")}
          </Button>
        )}
      </div>
    </div>
  );
}
