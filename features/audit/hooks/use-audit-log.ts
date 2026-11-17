"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/http";
import { fetchAuditLog } from "../services/audit-service";
import type { AuditLogFilters, AuditLogResult } from "../types";

interface AuditQuery {
  page: number;
  pageSize: number;
  filters: AuditLogFilters;
  revision: number;
}

interface AuditResponse {
  query: AuditQuery;
  result: AuditLogResult | null;
  error: "forbidden" | "unavailable" | null;
}

export function useAuditLog() {
  const [query, setQuery] = useState<AuditQuery>({ page: 1, pageSize: 20, filters: {}, revision: 0 });
  const [response, setResponse] = useState<AuditResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // El resultado pertenece a su consulta: nunca se presenta una página o filtro anterior.
    const timer = setTimeout(async () => {
      try {
        const result = await fetchAuditLog(query.page, query.pageSize, query.filters, controller.signal);
        if (!controller.signal.aborted) setResponse({ query, result, error: null });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResponse({
            query,
            result: null,
            error: error instanceof ApiError && error.status === 403 ? "forbidden" : "unavailable",
          });
        }
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const setFilters = useCallback((filters: AuditLogFilters) => {
    setQuery((previous) => ({ ...previous, page: 1, filters }));
  }, []);
  const setPage = useCallback((page: number) => {
    setQuery((previous) => ({ ...previous, page }));
  }, []);
  const setPageSize = useCallback((pageSize: number) => {
    setQuery((previous) => ({ ...previous, page: 1, pageSize }));
  }, []);
  const retry = useCallback(() => {
    setQuery((previous) => ({ ...previous, revision: previous.revision + 1 }));
  }, []);

  const current = response?.query === query;
  return {
    result: current ? response.result : null,
    error: current ? response.error : null,
    loading: !current,
    pageSize: query.pageSize,
    setFilters,
    setPage,
    setPageSize,
    retry,
  };
}
