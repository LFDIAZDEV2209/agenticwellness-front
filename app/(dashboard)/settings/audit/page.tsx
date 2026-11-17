"use client";

import { useState, type FormEvent } from "react";
import { History, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/providers/auth-provider";
import { useI18n, useT } from "@/providers/i18n-provider";
import { useAuditLog } from "@/features/audit/hooks/use-audit-log";
import type { AuditLogFilters } from "@/features/audit/types";

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const actionClasses: Record<string, string> = {
  INSERT: "bg-success-soft text-success-soft-foreground",
  UPDATE: "bg-info-soft text-info-soft-foreground",
  DELETE: "bg-destructive-soft text-destructive",
};

function AuditSkeleton() {
  const t = useT();
  return (
    <div
      role="status"
      aria-label={t("Cargando auditoría")}
      className="space-y-3 rounded-2xl border border-border bg-card p-5"
    >
      <span className="sr-only">{t("Cargando auditoría")}</span>
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

export default function AuditPage() {
  const { loading, hasPermission, user } = useAuth();
  const t = useT();
  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title={t("Auditoría")}
        description={t("Consulta la actividad registrada en el ERP.")}
        icon={History}
      />
      {loading ? (
        <AuditSkeleton />
      ) : hasPermission("Audit.View") ? (
        <AuditActivityLog key={user?.id} />
      ) : (
        <p
          role="alert"
          className="rounded-2xl border border-border bg-card p-5 text-sm"
        >
          {t("No tienes permiso para consultar la auditoría.")}
        </p>
      )}
    </div>
  );
}

function AuditActivityLog() {
  const t = useT();
  const { lang } = useI18n();
  const {
    result,
    loading,
    error,
    pageSize,
    setFilters,
    setPage,
    setPageSize,
    retry,
  } = useAuditLog();
  const [draft, setDraft] = useState({
    schema: "",
    table: "",
    action: "",
    actor: "",
    from: "",
    to: "",
    search: "",
  });
  const invalidDates = Boolean(draft.from && draft.to && draft.from > draft.to);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidDates) return;
    setFilters({
      schema: draft.schema || undefined,
      table: draft.table.trim() || undefined,
      action: (draft.action || undefined) as AuditLogFilters["action"],
      actor: draft.actor.trim() || undefined,
      search: draft.search.trim() || undefined,
      // El selector representa días locales completos, con ambos límites inclusivos.
      from: draft.from
        ? new Date(`${draft.from}T00:00:00.000`).toISOString()
        : undefined,
      to: draft.to
        ? new Date(`${draft.to}T23:59:59.999`).toISOString()
        : undefined,
    });
  }

  function clearFilters() {
    setDraft({
      schema: "",
      table: "",
      action: "",
      actor: "",
      from: "",
      to: "",
      search: "",
    });
    setFilters({});
  }

  return (
    <>
      <section
        aria-label={t("Filtros de auditoría")}
        className="rounded-2xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{t("Filtros")}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={retry}
            disabled={loading}
          >
            <RefreshCw data-icon="inline-start" />
            {t("Actualizar")}
          </Button>
        </div>
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            {t("Esquema")}
            <select
              value={draft.schema}
              onChange={(event) =>
                setDraft({ ...draft, schema: event.target.value })
              }
              className={selectClass}
            >
              <option value="">{t("Todos")}</option>
              {["app", "auth", "erp", "tele", "community", "ai", "audit"].map(
                (schema) => (
                  <option key={schema} value={schema}>
                    {schema}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            {t("Tabla")}
            <Input
              value={draft.table}
              onChange={(event) =>
                setDraft({ ...draft, table: event.target.value })
              }
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            {t("Acción")}
            <select
              value={draft.action}
              onChange={(event) =>
                setDraft({ ...draft, action: event.target.value })
              }
              className={selectClass}
            >
              <option value="">{t("Todas las acciones")}</option>
              {["INSERT", "UPDATE", "DELETE"].map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            {t("Actor (correo)")}
            <Input
              value={draft.actor}
              onChange={(event) =>
                setDraft({ ...draft, actor: event.target.value })
              }
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            {t("Desde")}
            <Input
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(event) =>
                setDraft({ ...draft, from: event.target.value })
              }
              aria-invalid={invalidDates}
              aria-describedby={invalidDates ? "audit-date-error" : undefined}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            {t("Hasta")}
            <Input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(event) =>
                setDraft({ ...draft, to: event.target.value })
              }
              aria-invalid={invalidDates}
              aria-describedby={invalidDates ? "audit-date-error" : undefined}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm sm:col-span-2 xl:col-span-3">
            {t("Registro o correlación")}
            <Input
              value={draft.search}
              onChange={(event) =>
                setDraft({ ...draft, search: event.target.value })
              }
            />
          </label>
          {invalidDates && (
            <p
              role="alert"
              id="audit-date-error"
              className="text-sm text-destructive sm:col-span-2 xl:col-span-3"
            >
              {t("La fecha Desde debe ser anterior o igual a Hasta.")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3">
            <Button type="submit" disabled={invalidDates}>
              {t("Aplicar filtros")}
            </Button>
            <Button type="button" variant="ghost" onClick={clearFilters}>
              {t("Limpiar filtros")}
            </Button>
          </div>
        </form>
      </section>

      {loading ? (
        <AuditSkeleton />
      ) : error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-sm"
        >
          <p>
            {error === "forbidden"
              ? t("No tienes permiso para consultar la auditoría.")
              : t("No se pudo cargar la auditoría. Intenta de nuevo.")}
          </p>
          {error !== "forbidden" && (
            <Button variant="outline" size="sm" onClick={retry}>
              {t("Reintentar")}
            </Button>
          )}
        </div>
      ) : (
        result && (
          <section
            aria-label={t("Actividad registrada")}
            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card"
          >
            <SectionHeader
              title={t("Actividad registrada")}
              description={
                result.total === 1
                  ? t("1 registro · Más reciente primero")
                  : t("{total} registros · Más recientes primero", {
                      total: String(result.total),
                    })
              }
              icon={History}
            />
            {result.items.length === 0 ? (
              <p role="status" className="p-6 text-sm text-muted-foreground">
                {t("No hay registros de auditoría para estos filtros.")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Fecha")}</TableHead>
                    <TableHead>{t("Acción")}</TableHead>
                    <TableHead>{t("Tabla")}</TableHead>
                    <TableHead>{t("Registro")}</TableHead>
                    <TableHead>{t("Actor")}</TableHead>
                    <TableHead>{t("Dirección IP")}</TableHead>
                    <TableHead>{t("Correlación")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {new Date(entry.occurredAt).toLocaleString(
                          lang === "en" ? "en-US" : "es-CO",
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={actionClasses[entry.action]}
                        >
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-64 break-all whitespace-normal">
                        {entry.schemaName}.{entry.tableName}
                      </TableCell>
                      <TableCell className="max-w-56 break-all whitespace-normal">
                        {entry.recordId}
                      </TableCell>
                      <TableCell className="max-w-64 break-all whitespace-normal">
                        <span className="block">
                          {entry.userEmail ?? entry.actorType}
                        </span>
                        {entry.userRole && (
                          <span className="block text-xs text-muted-foreground">
                            {entry.userRole}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{entry.ipAddress ?? "—"}</TableCell>
                      <TableCell className="max-w-56 break-all whitespace-normal">
                        {entry.correlationId ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
              <span aria-live="polite">
                {t("Página {page} de {totalPages}", {
                  page: String(result.page),
                  totalPages: String(Math.max(1, result.totalPages)),
                })}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  {t("Registros por página")}
                  <select
                    className={selectClass}
                    value={pageSize}
                    onChange={(event) =>
                      setPageSize(Number(event.target.value))
                    }
                  >
                    {[20, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={result.page <= 1}
                  onClick={() => setPage(result.page - 1)}
                >
                  {t("Anterior")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={result.page >= result.totalPages}
                  onClick={() => setPage(result.page + 1)}
                >
                  {t("Siguiente")}
                </Button>
              </div>
            </div>
          </section>
        )
      )}
    </>
  );
}
