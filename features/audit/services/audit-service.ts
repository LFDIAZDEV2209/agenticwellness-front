import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import type { AuditLogFilters, AuditLogResult } from "../types";

/** Consulta de solo lectura de la auditoría general del ERP. */
export function fetchAuditLog(
  page: number,
  pageSize: number,
  filters: AuditLogFilters,
  signal?: AbortSignal,
): Promise<AuditLogResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return apiFetch<AuditLogResult>(
    `${env.apiUrl}/api/v1/audit/activity-log?${params.toString()}`,
    { signal },
  );
}
