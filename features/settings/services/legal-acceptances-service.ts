import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";

export interface LegalAcceptanceFilters {
  accountId: string;
  documentCode: string;
  version: string;
  from: string;
  before: string;
}

export interface LegalAcceptance {
  receiptId: string;
  accountId: string;
  scope: string;
  documentCode: string;
  documentTitle: string;
  versionId: string;
  version: string;
  locale: string;
  acceptedAt: string;
  ip: string | null;
  userAgent: string | null;
}

export interface LegalAcceptancePage {
  items: LegalAcceptance[];
  total: number;
  page: number;
  pageSize: number;
}

const historyUrl = `${env.apiUrl}/api/v1/legal-acceptances`;

function queryString(filters: LegalAcceptanceFilters) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value) query.set(name, value);
  }
  return query;
}

export function listLegalAcceptances(filters: LegalAcceptanceFilters, page: number, signal: AbortSignal) {
  const query = queryString(filters);
  query.set("page", String(page));
  return apiFetch<LegalAcceptancePage>(`${historyUrl}?${query}`, { signal, cache: "no-store" });
}

export function exportLegalAcceptances(filters: LegalAcceptanceFilters, signal: AbortSignal) {
  return apiFetch<string>(`${historyUrl}/export?${queryString(filters)}`, {
    signal, cache: "no-store", headers: { Accept: "text/csv" },
  });
}
