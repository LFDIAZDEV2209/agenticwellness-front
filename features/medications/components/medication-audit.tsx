"use client";
import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { useT } from "@/providers/i18n-provider";
import { fetchMedicationAudit } from "../services";
import { useMedicationResource, medicationErrorKey } from "../hooks";
import { auditLabels } from "../monitoring-types";
import { MedicationError, MedicationLoading } from "./medication-shared";
import {
  PatientPicker,
  MonitoringPagination,
  useMonitoringFormat,
} from "./medication-monitoring-shared";
export function MedicationAuditLog() {
  const t = useT(),
    fmt = useMonitoringFormat();
  const [patientId, setPatientId] = useState(""),
    [action, setAction] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    [actor, setActor] = useState<{ id: string; label: string } | null>(null);
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchMedicationAudit(
        {
          ...(patientId ? { patientId } : {}),
          ...(actor ? { actorId: actor.id } : {}),
          ...(action ? { action } : {}),
          ...(from ? { from: from + "T00:00:00-05:00" } : {}),
          ...(to ? { to: to + "T23:59:59.999-05:00" } : {}),
        },
        page,
        signal,
      ),
    [patientId, action, from, to, page, actor],
  );
  const r = useMedicationResource(load);
  return (
    <>
      <PatientPicker
        value={patientId}
        onChange={(v) => {
          setPatientId(v);
          setPage(1);
        }}
      />
      <div className="medication-monitoring-filters">
        <NativeSelect
          ariaLabel={t("Acción de auditoría")}
          value={action}
          onChange={(v) => {
            setAction(v);
            setPage(1);
          }}
          options={[
            { value: "", label: t("Todas las acciones") },
            ...Object.entries(auditLabels).map(([value, label]) => ({
              value,
              label: t(label),
            })),
          ]}
        />
        <label>
          {t("Desde")}
          <Input
            aria-label={t("Desde")}
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          {t("Hasta")}
          <Input
            aria-label={t("Hasta")}
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <Button variant="outline" onClick={r.retry}>
          {t("Actualizar")}
        </Button>
      </div>
      {actor && (
        <div className="medication-inline-actions">
          <Badge variant="outline">{actor.label}</Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setActor(null);
              setPage(1);
            }}
          >
            {t("Quitar filtro de usuario")}
          </Button>
        </div>
      )}
      <section className="medication-monitoring-card">
        {r.loading ? (
          <MedicationLoading />
        ) : r.error ? (
          <MedicationError
            message={t(medicationErrorKey(r.error))}
            retry={r.retry}
          />
        ) : (
          <>
            <Table aria-label={t("Auditoría de medicamentos")}>
              <TableHeader>
                <TableRow>
                  {[
                    "Fecha",
                    "Persona",
                    "Acción",
                    "Usuario",
                    "Recurso",
                    "Finalidad",
                  ].map((x) => (
                    <TableHead key={x}>{t(x)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.data?.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {fmt.date(entry.createdAt)}
                      <span className="medication-muted">
                        {fmt.time(entry.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="medication-name"
                        title={entry.patientName}
                      >
                        {entry.patientName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(auditLabels[entry.action] ?? entry.action)}
                      </Badge>
                    </TableCell>
                    <TableCell title={entry.actorId ?? ""}>
                      {entry.actorId ? (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => {
                            setActor({
                              id: entry.actorId!,
                              label: entry.actorEmail ?? entry.actorId!,
                            });
                            setPage(1);
                          }}
                        >
                          {entry.actorEmail ?? entry.actorId}
                        </Button>
                      ) : (
                        t("Sistema")
                      )}
                    </TableCell>
                    <TableCell>
                      {t(
                        (
                          {
                            tracking: "Seguimiento diario",
                            workspace: "Ficha de la persona",
                            inventory: "Inventario",
                            inventory_movements: "Movimientos",
                            effects: "Efectos reportados",
                            effect: "Síntoma reportado",
                            alerts: "Alertas",
                            alert: "Alerta",
                            dose: "Toma",
                            treatment: "Plan de medicación",
                            access: "Acceso",
                          } as Record<string, string>
                        )[entry.resource] ?? entry.resource,
                      )}
                    </TableCell>
                    <TableCell>{entry.purpose ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!r.data?.items.length && (
              <p className="medication-empty-line">
                {t("Sin registros para estos filtros")}
              </p>
            )}
            {r.data && (
              <MonitoringPagination
                page={page}
                total={r.data.total}
                pageSize={r.data.pageSize}
                loading={r.loading}
                onChange={setPage}
              />
            )}
          </>
        )}
      </section>
    </>
  );
}
