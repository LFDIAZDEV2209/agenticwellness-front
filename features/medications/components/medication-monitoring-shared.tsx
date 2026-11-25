"use client";
import { useCallback, useDeferredValue, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useI18n, useT } from "@/providers/i18n-provider";
import { fetchMedicationPatients } from "../services";
import { useMedicationResource } from "../hooks";
export function PatientPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const load = useCallback(
    (signal: AbortSignal) => fetchMedicationPatients(deferred, 1, signal),
    [deferred],
  );
  const resource = useMedicationResource(load);
  return (
    <div className="medication-patient-picker">
      <Input
        aria-label={t("Buscar persona")}
        placeholder={t("Buscar persona")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <NativeSelect
        ariaLabel={t("Persona")}
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: t("Selecciona una persona") },
          ...(resource.data?.items.map((p) => ({
            value: p.patientId,
            label: p.name,
          })) ?? []),
        ]}
      />
    </div>
  );
}
export function MonitoringPagination({
  page,
  total,
  pageSize,
  loading,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  loading: boolean;
  onChange: (page: number) => void;
}) {
  const t = useT();
  return (
    <div className="medication-pagination">
      <span>
        {t("Página {page} de {pages}", {
          page: String(page),
          pages: String(Math.max(1, Math.ceil(total / pageSize))),
        })}
      </span>
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          {t("Anterior")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || page * pageSize >= total}
          onClick={() => onChange(page + 1)}
        >
          {t("Siguiente")}
        </Button>
      </div>
    </div>
  );
}
export function useMonitoringFormat() {
  const { lang } = useI18n();
  const locale = lang === "en" ? "en-US" : "es-CO";
  return {
    shortDay: (value: string) =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(value + "T12:00:00Z")),
    date: (value: string) =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value)),
    time: (value: string, zone = "America/Bogota") =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone,
      }).format(new Date(value)),
    number: (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value),
  };
}
