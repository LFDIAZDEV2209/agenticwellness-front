"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";
import { ProgramTemplateImpactDialog } from "./program-template-impact-dialog";
import {
  Trophy,
  Plus,
  RefreshCw,
  Eye,
  Pencil,
  Send,
  Archive,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useProgramTemplates } from "../hooks/use-program-templates";
import {
  TEMPLATE_STATUS_LABELS,
  STATUS_OPTIONS,
} from "../services/program-templates-service";
import { ProgramTemplateFormDialog } from "./program-template-form";
import { ProgramTemplateDetailDialog } from "./program-template-detail";
import type { ProgramTemplateListItem } from "../types";
import { SEQUENCE_DAYS, SEQUENCE_WEEKS } from "../services/program-sequence";

const mobileQuery = "(max-width: 767px)";
function subscribeMobileLayout(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const serverMobileSnapshot = () => false;

export function ProgramTemplatesPage() {
  const { hasPermission } = useAuth();
  const t = useT();
  const {
    result,
    loading,
    actionLoading,
    filters,
    error,
    setFilters,
    setPage,
    setPageSize,
    getTemplate,
    save,
    publish,
    archive,
    saveWeekdayTasks,
    retry,
  } = useProgramTemplates();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProgramTemplateListItem | undefined>();
  const [details, setDetails] = useState<ProgramTemplateListItem | undefined>();
  const [publishing, setPublishing] = useState<
    ProgramTemplateListItem | undefined
  >();
  const [archiving, setArchiving] = useState<
    ProgramTemplateListItem | undefined
  >();
  const [editFailure, setEditFailure] =
    useState<ProgramTemplateListItem | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const editRequest = useRef(false);
  const editAlert = useRef<HTMLDivElement>(null);
  const isMobile = useSyncExternalStore(
    subscribeMobileLayout,
    mobileSnapshot,
    serverMobileSnapshot,
  );
  useEffect(() => {
    if (editFailure) editAlert.current?.focus();
  }, [editFailure]);

  const openCreate = () => {
    setEditFailure(null);
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = async (tpl: ProgramTemplateListItem) => {
    if (editRequest.current) return;
    editRequest.current = true;
    setLoadingEdit(true);
    setEditFailure(null);
    try {
      const full = await getTemplate(tpl.id);
      if (full) {
        setEditing(full);
        setFormOpen(true);
      } else setEditFailure(tpl);
    } finally {
      editRequest.current = false;
      setLoadingEdit(false);
    }
  };

  const duration = (tpl: ProgramTemplateListItem) => {
    const days =
      tpl.totalWeeks === SEQUENCE_WEEKS ? SEQUENCE_DAYS : tpl.totalWeeks * 7;
    return t("{days} día{daySuffix} · {weeks} semana{weekSuffix}", {
      days: String(days),
      daySuffix: days === 1 ? "" : "s",
      weeks: String(tpl.totalWeeks),
      weekSuffix: tpl.totalWeeks === 1 ? "" : "s",
    });
  };
  const actions = (tpl: ProgramTemplateListItem, compact = false) => (
    <div
      role="group"
      aria-label={t("Acciones")}
      className={`flex flex-wrap items-center gap-1 ${compact ? "justify-end" : "justify-start gap-2"}`}
    >
      <Button
        variant="ghost"
        size={compact ? "icon" : "sm"}
        className={compact ? "size-8" : "min-h-11"}
        title={t("Ver detalles")}
        disabled={loadingEdit}
        onClick={() => setDetails(tpl)}
      >
        <Eye className="size-4" aria-hidden />
        {!compact && t("Ver detalles")}
      </Button>
      <Button
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "sm"}
        className={compact ? "size-8" : "min-h-11"}
        title={t("Editar")}
        disabled={loadingEdit}
        onClick={() => void openEdit(tpl)}
      >
        <Pencil className="size-4" aria-hidden />
        {!compact && t("Editar")}
      </Button>
      {tpl.status === "Draft" && hasPermission("Program.Edit") && (
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={compact ? "size-8 text-success" : "min-h-11 text-success"}
          title={t("Publicar")}
          disabled={loadingEdit}
          onClick={() => setPublishing(tpl)}
        >
          <Send className="size-4" aria-hidden />
          {!compact && t("Publicar")}
        </Button>
      )}
      {tpl.status === "Active" && (
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={
            compact
              ? "size-8 text-muted-foreground"
              : "min-h-11 text-muted-foreground"
          }
          title={t("Archivar")}
          disabled={loadingEdit}
          onClick={() => setArchiving(tpl)}
        >
          <Archive className="size-4" aria-hidden />
          {!compact && t("Archivar")}
        </Button>
      )}
    </div>
  );

  const statusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-success-soft text-success-soft-foreground";
      case "Draft":
        return "bg-warning-soft text-warning";
      case "Archived":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 min-w-0">
      <PageHeader
        title="Plantillas de programa"
        description="Gestiona las plantillas del programa de gamificación"
        icon={Trophy}
        actions={
          <Button size="sm" onClick={openCreate} disabled={loadingEdit}>
            <Plus data-icon="inline-start" />
            Nueva plantilla
          </Button>
        }
      />

      {/* Filtros */}
      <section
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
        aria-label="Filtros de plantillas"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Plantillas de programa</h2>
            <p className="text-xs text-muted-foreground">
              Filtra por estado o busca por nombre/código.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={retry}
            disabled={loading}
          >
            <RefreshCw
              data-icon="inline-start"
              className={loading ? "animate-spin" : undefined}
            />
            Actualizar
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Buscar por nombre o código..."
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            className="h-9 w-full sm:max-w-xs"
          />
          <Select
            value={filters.status}
            onValueChange={(v) =>
              setFilters({ status: v as typeof filters.status })
            }
          >
            <SelectTrigger className="h-9 w-full sm:w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {editFailure && (
        <div
          ref={editAlert}
          role="alert"
          tabIndex={-1}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-destructive-soft/40 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">
              {t("No se pudo abrir la plantilla")}
            </p>
            <p className="break-words text-sm text-muted-foreground">
              {editFailure.name}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={loadingEdit}
            onClick={() => void openEdit(editFailure)}
          >
            <RefreshCw aria-hidden />
            {t("Reintentar")}
          </Button>
        </div>
      )}

      {/* Contenido */}
      {loading ? (
        <TemplatesSkeleton />
      ) : error ? (
        <TemplatesErrorState message={error} onRetry={retry} />
      ) : result && result.data.length > 0 ? (
        <div className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-brand-blue-soft/40 bg-card shadow-xs">
          <SectionHeader
            title={`${result.total} ${result.total === 1 ? "plantilla" : "plantillas"} disponibles`}
            icon={Trophy}
            variant="primary"
          />
          {isMobile ? (
            <div className="flex flex-col gap-3 p-3">
              {result.data.map((tpl) => (
                <article
                  key={tpl.id}
                  aria-label={tpl.name}
                  className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background p-4"
                >
                  <header className="flex items-start justify-between gap-3">
                    <h3
                      className="min-w-0 break-words text-sm font-semibold"
                      title={tpl.name}
                    >
                      {tpl.name}
                    </h3>
                    <Badge className={`shrink-0 ${statusColor(tpl.status)}`}>
                      {t(TEMPLATE_STATUS_LABELS[tpl.status] ?? tpl.status)}
                    </Badge>
                  </header>
                  {tpl.description && (
                    <p
                      className="line-clamp-2 break-words text-xs text-muted-foreground"
                      title={tpl.description}
                    >
                      {tpl.description}
                    </p>
                  )}
                  <p className="text-sm font-medium">{duration(tpl)}</p>
                  <p className="break-all text-xs text-muted-foreground">
                    {tpl.code} · v{tpl.version}
                  </p>
                  <footer className="border-t border-border pt-3">
                    {actions(tpl)}
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Código
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      Duración
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Versión
                    </TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Creado
                    </TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.data.map((tpl) => (
                    <TableRow key={tpl.id}>
                      <TableCell>
                        <div className="flex max-w-[280px] flex-col">
                          <span
                            className="line-clamp-2 whitespace-normal break-words font-medium"
                            title={tpl.name}
                          >
                            {tpl.name}
                          </span>
                          {tpl.description && (
                            <span className="text-xs text-muted-foreground line-clamp-1">
                              {tpl.description}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm font-mono">
                        {tpl.code}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        <span className="font-medium text-foreground">
                          {duration(tpl)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        v{tpl.version}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColor(tpl.status)}>
                          {TEMPLATE_STATUS_LABELS[tpl.status] ?? tpl.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {new Date(tpl.createdAt).toLocaleDateString("es-CO")}
                      </TableCell>
                      <TableCell className="text-right">
                        {actions(tpl, true)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : (
        <TemplatesEmptyState onCreate={openCreate} />
      )}

      {/* Paginación */}
      {result && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
          <span>
            Página {result.page} de {result.totalPages}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={result.pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Plantillas por página"
            >
              <option value={5}>5 por página</option>
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
              <option value={50}>50 por página</option>
            </select>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={result.page === 1}
                onClick={() => setPage(result.page - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={result.page === result.totalPages}
                onClick={() => setPage(result.page + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ProgramTemplateFormDialog
        key={`${editing?.id ?? "new"}-${formOpen}`}
        open={formOpen}
        template={editing}
        saving={actionLoading}
        onOpenChange={setFormOpen}
        onSubmit={save}
      />

      <ProgramTemplateDetailDialog
        key={details?.id ?? "closed"}
        templateId={details?.id ?? null}
        onClose={() => setDetails(undefined)}
        getTemplate={getTemplate}
        saveWeekdayTasks={saveWeekdayTasks}
      />

      {publishing && (
        <ProgramTemplateImpactDialog
          key={publishing.id}
          template={publishing}
          onClose={() => setPublishing(undefined)}
          onPublish={publish}
          onEdit={() => {
            setDetails(publishing);
            setPublishing(undefined);
          }}
        />
      )}

      {/* Confirmar archivado */}
      <AlertDialog
        open={Boolean(archiving)}
        onOpenChange={(open) => !open && setArchiving(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogMedia className="bg-muted text-muted-foreground">
            <Archive />
          </AlertDialogMedia>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Archivar plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              Se archivará la plantilla &quot;{archiving?.name}&quot;. No se
              podrá usar para nuevas inscripciones, pero las inscripciones
              existentes continuarán activas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionLoading}
              onClick={async () => {
                if (archiving) await archive(archiving.id);
                setArchiving(undefined);
              }}
            >
              Archivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// --- Sub-componentes ---

function TemplatesSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border py-4 last:border-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="hidden h-5 w-20 md:block" />
          <Skeleton className="hidden h-4 w-16 md:block" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <div className="ml-auto flex gap-1">
            <Skeleton className="size-8 rounded" />
            <Skeleton className="size-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplatesErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive-soft/40 py-14 text-center">
      <p className="text-sm font-semibold text-destructive">
        No pudimos cargar las plantillas
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw data-icon="inline-start" />
        Reintentar
      </Button>
    </div>
  );
}

function TemplatesEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
        <Trophy className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold">No hay plantillas de programa</p>
        <p className="text-xs text-muted-foreground">
          Crea tu primera plantilla para definir el programa de gamificación.
        </p>
      </div>
      <Button size="sm" onClick={onCreate}>
        <Plus data-icon="inline-start" />
        Nueva plantilla
      </Button>
    </div>
  );
}
