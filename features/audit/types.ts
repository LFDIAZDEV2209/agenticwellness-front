/** Proyección pública de auditoría, sin datos anteriores, posteriores ni metadatos. */
export interface AuditLogEntry {
  id: string;
  occurredAt: string;
  action: string;
  schemaName: string;
  tableName: string;
  recordId: string;
  actorType: string;
  userEmail: string | null;
  userRole: string | null;
  ipAddress: string | null;
  correlationId: string | null;
}

export interface AuditLogResult {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditLogFilters {
  schema?: string;
  table?: string;
  action?: "INSERT" | "UPDATE" | "DELETE";
  actor?: string;
  /** Fecha ISO con zona horaria, inclusive. */
  from?: string;
  /** Fecha ISO con zona horaria, inclusive. */
  to?: string;
  search?: string;
}
