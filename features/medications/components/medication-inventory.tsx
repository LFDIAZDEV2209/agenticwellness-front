"use client";
import { useCallback, useDeferredValue, useState } from "react";
import Link from "next/link";
import { Package, History, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { useT } from "@/providers/i18n-provider";
import {
  useMedicationCapabilities,
  useMedicationResource,
  medicationErrorKey,
} from "../hooks";
import {
  fetchMedicationInventory,
  fetchPatientInventory,
  fetchMedicationMovements,
} from "../services";
import type { MedicationSupply } from "../monitoring-types";
import { MedicationError, MedicationLoading } from "./medication-shared";
import { MedicationStockForm } from "./medication-stock-form";
import {
  MonitoringPagination,
  useMonitoringFormat,
} from "./medication-monitoring-shared";
export function MedicationInventory({ patientId }: { patientId?: string }) {
  const t = useT(),
    fmt = useMonitoringFormat(),
    cap = useMedicationCapabilities();
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<MedicationSupply | null>(null),
    [history, setHistory] = useState<MedicationSupply | null>(null);
  const deferred = useDeferredValue(query);
  const load = useCallback(
    (signal: AbortSignal) =>
      patientId
        ? fetchPatientInventory(patientId, signal)
        : fetchMedicationInventory(deferred, page, undefined, signal),
    [patientId, deferred, page],
  );
  const r = useMedicationResource(load);
  const historyLoad = useCallback(
    (signal: AbortSignal) =>
      history
        ? fetchMedicationMovements(
            history.patientId,
            history.treatmentId,
            signal,
          )
        : Promise.resolve(null),
    [history],
  );
  const ledger = useMedicationResource(historyLoad);
  return (
    <section className="medication-monitoring-card">
      <div className="medication-monitoring-toolbar">
        <h2>
          <Package aria-hidden />
          {t(patientId ? "Inventario del paciente" : "Existencias")}
        </h2>
        <div className="medication-inline-actions">
          {!patientId && (
            <Input
              aria-label={t("Buscar en inventario")}
              placeholder={t("Persona o medicamento")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Actualizar inventario")}
            onClick={r.retry}
          >
            <RefreshCw />
          </Button>
        </div>
      </div>
      {editing && (
        <MedicationStockForm
          key={editing.treatmentId + ":" + editing.revision}
          supply={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            r.retry();
            ledger.retry();
          }}
        />
      )}
      {r.loading ? (
        <MedicationLoading />
      ) : r.error ? (
        <MedicationError
          message={t(medicationErrorKey(r.error))}
          retry={r.retry}
        />
      ) : (
        <>
          <Table aria-label={t("Inventario de pacientes")}>
            <TableHeader>
              <TableRow>
                {[
                  ...(!patientId ? ["Paciente"] : []),
                  "Medicamento",
                  "Existencias",
                  "Días restantes",
                  "Vencimiento",
                  "Acciones",
                ].map((x) => (
                  <TableHead key={x}>{t(x)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.data?.items.map((s) => (
                <TableRow key={s.treatmentId}>
                  {!patientId && (
                    <TableCell>
                      <Link
                        href={"/medications/" + s.patientId}
                        className="medication-name"
                        title={s.patientName}
                      >
                        {s.patientName}
                      </Link>
                    </TableCell>
                  )}
                  <TableCell>
                    <strong className="medication-name" title={s.name}>
                      {s.name}
                    </strong>
                    <span className="medication-muted">
                      {fmt.number(s.dailyUsage)} {s.unit}/{t("día")}
                    </span>
                  </TableCell>
                  <TableCell>
                    {s.tracked ? (
                      <>
                        <strong>{fmt.number(s.balance)}</strong> {s.unit}
                        {s.balance < 0 && (
                          <Badge variant="outline" tone="amber">
                            {t("Por conciliar")}
                          </Badge>
                        )}
                      </>
                    ) : (
                      t("Sin conteo")
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      tone={
                        s.daysRemaining !== null && s.daysRemaining <= 4
                          ? "amber"
                          : "slate"
                      }
                    >
                      {s.daysRemaining === null ? "—" : s.daysRemaining}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {s.expiresOn ? fmt.date(s.expiresOn) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="medication-inline-actions">
                      {cap.canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(s)}
                        >
                          <Plus data-icon="inline-start" />
                          {t(
                            s.tracked
                              ? "Registrar movimiento"
                              : "Registrar existencias",
                          )}
                        </Button>
                      )}
                      {s.tracked && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t("Movimientos de {name}", {
                            name: s.name,
                          })}
                          onClick={() => setHistory(s)}
                        >
                          <History data-icon="inline-start" />
                          {t("Movimientos")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!r.data?.items.length && (
            <p className="medication-empty-line">
              {t("Sin medicamentos registrados")}
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
      {history && (
        <section
          className="medication-ledger"
          aria-label={t("Movimientos de inventario")}
        >
          <div className="medication-monitoring-toolbar">
            <h3>
              {t("Movimientos")} · {history.name}
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setHistory(null)}>
              {t("Cerrar")}
            </Button>
          </div>
          {ledger.loading ? (
            <MedicationLoading />
          ) : ledger.error ? (
            <MedicationError message={t(medicationErrorKey(ledger.error))} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {["Fecha", "Movimiento", "Cantidad", "Saldo", "Motivo"].map(
                    (x) => (
                      <TableHead key={x}>{t(x)}</TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.data?.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {fmt.date(m.recordedAt)} {fmt.time(m.recordedAt)}
                    </TableCell>
                    <TableCell>
                      {t(
                        (
                          {
                            initial: "Conteo inicial",
                            refill: "Reposición",
                            adjustment: "Ajuste de inventario",
                            consumption: "Consumo",
                            correction: "Corrección",
                          } as Record<string, string>
                        )[m.kind] ?? m.kind,
                      )}
                    </TableCell>
                    <TableCell>{fmt.number(m.quantityDelta)}</TableCell>
                    <TableCell>{fmt.number(m.balanceAfter)}</TableCell>
                    <TableCell>{m.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </section>
  );
}
