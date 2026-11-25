"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/http";
import { useAuth } from "@/providers/auth-provider";
import { useAppContext } from "@/providers/context-provider";
import { useI18n, useT } from "@/providers/i18n-provider";
import { exportLegalAcceptances, listLegalAcceptances } from "../services/legal-acceptances-service";
import type { LegalAcceptanceFilters, LegalAcceptancePage } from "../services/legal-acceptances-service";
import { LegalDocumentsSection } from "./legal-documents-section";

export function LegalSettingsSection() {
  const t = useT();
  const { user } = useAuth();
  const { can, activeClinicId } = useAppContext();
  const [selected, setSelected] = useState<"documents" | "acceptances">("documents");
  const canReadDocuments = can("LegalDocuments.View");
  const canView = can("LegalAcceptances.View");
  const canExport = can("LegalAcceptances.Export");
  const canUseHistory = canView || canExport;
  const showHistory = canUseHistory && (selected === "acceptances" || !canReadDocuments);

  return (
    <>
      {canReadDocuments && canUseHistory && (
        <div className="flex flex-wrap gap-2 border-b px-4 py-3">
          <Button type="button" size="sm" variant={showHistory ? "outline" : "secondary"}
            aria-pressed={!showHistory} onClick={() => setSelected("documents")}>
            {t("Documentos legales")}
          </Button>
          <Button type="button" size="sm" variant={showHistory ? "secondary" : "outline"}
            aria-pressed={showHistory} onClick={() => setSelected("acceptances")}>
            {t("Historial de aceptaciones")}
          </Button>
        </div>
      )}
      {showHistory ? (
        <LegalAcceptancesSection key={`${user?.id ?? ""}:${activeClinicId ?? ""}:${canView}:${canExport}`}
          canView={canView} canExport={canExport} />
      ) : canReadDocuments && <LegalDocumentsSection />}
    </>
  );
}

const emptyFilters: LegalAcceptanceFilters = { accountId: "", documentCode: "", version: "", from: "", before: "" };
type HistoryRequest = { filters: LegalAcceptanceFilters; page: number };
type HistoryResult = { request: HistoryRequest; page?: LegalAcceptancePage; error?: unknown };

function LegalAcceptancesSection({ canView, canExport }: { canView: boolean; canExport: boolean }) {
  const t = useT();
  const { lang } = useI18n();
  const [request, setRequest] = useState<HistoryRequest>({ filters: emptyFilters, page: 1 });
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [invalidDates, setInvalidDates] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<"denied" | "limit" | "error" | null>(null);
  const exportRequest = useRef<AbortController | null>(null);
  const current = result?.request === request ? result : null;
  const totalPages = current?.page ? Math.max(1, Math.ceil(current.page.total / current.page.pageSize)) : 1;
  const hasPrevious = Boolean(current?.page) && request.page > 1;
  const hasNext = Boolean(current?.page) && request.page < totalPages;

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    void listLegalAcceptances(request.filters, request.page, controller.signal).then(
      page => { if (!controller.signal.aborted) setResult({ request, page }); },
      error => { if (!controller.signal.aborted) setResult({ request, error }); },
    );
    return () => controller.abort();
  }, [canView, request]);

  useEffect(() => () => exportRequest.current?.abort(), []);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fromDay = String(form.get("from"));
    const throughDay = String(form.get("before"));
    const invalid = Boolean(fromDay && throughDay && fromDay > throughDay);
    setInvalidDates(invalid);
    if (invalid) return;

    const from = fromDay ? new Date(`${fromDay}T00:00:00.000Z`).toISOString() : "";
    const through = throughDay ? new Date(`${throughDay}T00:00:00.000Z`) : null;
    if (through) through.setUTCDate(through.getUTCDate() + 1);
    setExportError(null);
    setRequest({ page: 1, filters: {
      accountId: String(form.get("accountId")).trim(), documentCode: String(form.get("documentCode")).trim(),
      version: String(form.get("version")).trim(), from, before: through?.toISOString() ?? "",
    } });
  }

  async function download() {
    if (exportRequest.current) return;
    const controller = new AbortController();
    exportRequest.current = controller;
    setExporting(true);
    setExportError(null);
    try {
      const csv = await exportLegalAcceptances(request.filters, controller.signal);
      if (controller.signal.aborted) return;
      const content = csv.startsWith("\uFEFF") ? csv : "\uFEFF" + csv;
      const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "legal-acceptances.csv";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted) {
        setExportError(error instanceof ApiError && error.status === 403 ? "denied"
          : error instanceof ApiError && error.status === 422 ? "limit" : "error");
      }
    } finally {
      exportRequest.current = null;
      if (!controller.signal.aborted) setExporting(false);
    }
  }

  const acceptedDate = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" });

  return (
    <section className="min-w-0 space-y-4 p-4 sm:p-6" aria-labelledby="legal-acceptances-title">
      <h2 id="legal-acceptances-title" className="text-lg font-semibold">{t("Historial de aceptaciones")}</h2>
      <form onSubmit={applyFilters} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="legal-history-account">{t("ID de cuenta")}</Label>
          <Input id="legal-history-account" name="accountId" maxLength={36}
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="legal-history-document">{t("Código del documento")}</Label>
          <Input id="legal-history-document" name="documentCode" maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="legal-history-version">{t("Versión")}</Label>
          <Input id="legal-history-version" name="version" maxLength={21} pattern="[0-9]+[.][0-9]+" placeholder="2.0" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="legal-history-from">{t("Desde (UTC)")}</Label>
          <Input id="legal-history-from" name="from" type="date" max="9999-12-30" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="legal-history-through">{t("Hasta (UTC)")}</Label>
          <Input id="legal-history-through" name="before" type="date" max="9999-12-30" aria-invalid={invalidDates}
            aria-describedby={invalidDates ? "legal-history-invalid-range" : undefined} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={exporting}>{t("Aplicar filtros")}</Button>
          {canExport && <Button type="button" variant="outline" disabled={exporting} onClick={() => void download()}>
            {exporting ? t("Descargando…") : t("Descargar CSV")}
          </Button>}
        </div>
      </form>
      {invalidDates && <p id="legal-history-invalid-range" role="alert" className="text-sm text-destructive">
        {t("La fecha final debe ser igual o posterior a la inicial.")}
      </p>}
      {exportError && <p role="alert" className="text-sm text-destructive">
        {exportError === "denied" ? t("No tienes permiso para exportar aceptaciones.")
          : exportError === "limit" ? t("Acota los filtros para descargar hasta 5000 aceptaciones.")
          : t("No pudimos descargar el CSV. Intenta de nuevo.")}
      </p>}
      {canView && (current === null ? (
        <div className="space-y-2" role="status">
          <span className="sr-only">{t("Cargando aceptaciones…")}</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : current.error ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive" role="alert">{current.error instanceof ApiError && current.error.status === 403
            ? t("No tienes permiso para consultar aceptaciones.") : t("No pudimos cargar las aceptaciones.")}</p>
          <Button type="button" variant="outline" onClick={() => setRequest({ ...request })}>{t("Reintentar")}</Button>
        </div>
      ) : current.page && (current.page.items.length ? (
        <>
          <div className="overflow-x-auto rounded-md border" role="region" aria-label={t("Recibos de aceptación")} tabIndex={0}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t("Recibos de aceptación")}</caption>
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3">{t("ID de cuenta")}</th>
                  <th scope="col" className="p-3">{t("Documento")}</th>
                  <th scope="col" className="p-3">{t("Versión")}</th>
                  <th scope="col" className="p-3">{t("Idioma")}</th>
                  <th scope="col" className="whitespace-nowrap p-3">{t("Fecha de aceptación (UTC)")}</th>
                  <th scope="col" className="p-3">{t("IP")}</th>
                  <th scope="col" className="p-3">{t("Agente de usuario")}</th>
                  <th scope="col" className="p-3">{t("ID del recibo")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {current.page.items.map(item => (
                  <tr key={item.receiptId}>
                    <td className="whitespace-nowrap p-3 font-mono text-xs">{item.accountId}</td>
                    <td className="min-w-40 p-3">
                      <span className="block">{item.documentTitle}</span>
                      <code className="text-xs text-muted-foreground">{item.documentCode}</code>
                    </td>
                    <td className="p-3">{item.version}</td>
                    <td className="p-3">{item.locale.toUpperCase()}</td>
                    <td className="whitespace-nowrap p-3"><time dateTime={item.acceptedAt}>{acceptedDate.format(new Date(item.acceptedAt))}</time></td>
                    <td className="p-3 font-mono text-xs">{item.ip ?? "—"}</td>
                    <td className="min-w-40 max-w-xs break-all p-3 text-xs">{item.userAgent ?? "—"}</td>
                    <td className="whitespace-nowrap p-3 font-mono text-xs">{item.receiptId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p role="status" className="text-sm text-muted-foreground">{t("No hay aceptaciones para los filtros seleccionados.")}</p>))}
      {canView && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" role="status">{current?.page && t("Página {page} de {pages} · {count} aceptaciones", {
            page: String(current.page.page), pages: String(totalPages), count: String(current.page.total),
          })}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" aria-disabled={!hasPrevious} className="aria-disabled:opacity-50"
              onClick={() => { if (hasPrevious) setRequest({ ...request, page: request.page - 1 }); }}>{t("Anterior")}</Button>
            <Button type="button" size="sm" variant="outline" aria-disabled={!hasNext} className="aria-disabled:opacity-50"
              onClick={() => { if (hasNext) setRequest({ ...request, page: request.page + 1 }); }}>{t("Siguiente")}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
