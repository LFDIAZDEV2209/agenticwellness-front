"use client";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useT } from "@/providers/i18n-provider";
import { fetchMedicationWeek } from "../services";
import { useMedicationResource, medicationErrorKey } from "../hooks";
import { MedicationTrackingEmpty } from "./medication-tracking-empty";
import { timingLabels } from "../monitoring-types";
import { MedicationError, MedicationLoading } from "./medication-shared";
import {
  PatientPicker,
  useMonitoringFormat,
} from "./medication-monitoring-shared";
const addDays = (date: string, amount: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
};
function monday() {
  const day = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Bogota",
  });
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}
export function MedicationTracking({
  initialPatientId,
}: {
  initialPatientId?: string;
}) {
  const t = useT(),
    fmt = useMonitoringFormat();
  const pickerRef = useRef<HTMLDivElement>(null);
  function choosePatient() {
    const select = pickerRef.current?.querySelector("select");
    select?.focus();
    try {
      select?.showPicker?.();
    } catch {
      /* Focus conserva el acceso por teclado si el navegador no abre el selector. */
    }
  }
  const [patientId, setPatientId] = useState(initialPatientId ?? ""),
    [from, setFrom] = useState(monday),
    [selected, setSelected] = useState(() =>
      new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }),
    );
  const load = useCallback(
    (signal: AbortSignal) =>
      patientId
        ? fetchMedicationWeek(patientId, from, "America/Bogota", signal)
        : Promise.resolve(null),
    [patientId, from],
  );
  const r = useMedicationResource(load);
  const data = r.data;
  const rows = data
    ? Array.from(
        new Map(
          data.doses.map((d) => [
            d.dose.treatmentId +
              ":" +
              fmt.time(d.dose.scheduledAt, data.timeZone),
            {
              treatmentId: d.dose.treatmentId,
              name: d.dose.name,
              time: fmt.time(d.dose.scheduledAt, data.timeZone),
              required: d.isRequired,
            },
          ]),
        ).values(),
      )
    : [];
  const selectedDate = data?.days.some((d) => d.date === selected)
    ? selected
    : from;
  const detail = data?.doses.filter((d) => d.localDate === selectedDate) ?? [];
  const due = data?.days.reduce((n, d) => n + d.due, 0) ?? 0,
    taken = data?.days.reduce((n, d) => n + d.taken, 0) ?? 0;
  function move(amount: number) {
    const next = addDays(from, amount);
    setFrom(next);
    setSelected(next);
  }
  return (
    <>
      {!initialPatientId && (
        <div ref={pickerRef}>
          <PatientPicker value={patientId} onChange={setPatientId} />
        </div>
      )}
      {patientId ? (
        r.loading ? (
          <MedicationLoading />
        ) : r.error ? (
          <MedicationError
            message={t(medicationErrorKey(r.error))}
            retry={r.retry}
          />
        ) : (
          data && (
            <>
              <section className="medication-monitoring-card">
                <div className="medication-monitoring-toolbar">
                  <div>
                    <h2>
                      <CalendarDays aria-hidden />
                      {data.patient.name}
                    </h2>
                    <p>
                      {fmt.date(data.from)} — {fmt.date(data.to)}
                    </p>
                  </div>
                  <div className="medication-inline-actions">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("Semana anterior")}
                      onClick={() => move(-7)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFrom(monday());
                        setSelected(
                          new Date().toLocaleDateString("en-CA", {
                            timeZone: "America/Bogota",
                          }),
                        );
                      }}
                    >
                      {t("Esta semana")}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("Semana siguiente")}
                      onClick={() => move(7)}
                    >
                      <ChevronRight />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Actualizar seguimiento")}
                      onClick={r.retry}
                    >
                      <RefreshCw />
                    </Button>
                  </div>
                </div>
                <div className="medication-monitoring-stats">
                  <span>
                    <strong>
                      {due ? Math.round((taken * 100) / due) + "%" : "—"}
                    </strong>
                    {t("Adherencia de la semana")}
                  </span>
                  <span>
                    <strong>
                      {taken}/{due}
                    </strong>
                    {t("Tomas asignadas evaluadas")}
                  </span>
                  <Link href={"/medications/" + patientId}>
                    {t("Ver paciente")}
                  </Link>
                </div>
                <Table
                  className="medication-week-grid"
                  aria-label={t("Semana de medicamentos")}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Medicina y horario")}</TableHead>
                      {data.days.map((day) => (
                        <TableHead key={day.date}>
                          <Button
                            size="sm"
                            variant={
                              day.date === selectedDate ? "secondary" : "ghost"
                            }
                            aria-label={t("Detalle del {date}", {
                              date: day.date,
                            })}
                            onClick={() => setSelected(day.date)}
                          >
                            {fmt.shortDay(day.date)}
                          </Button>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.treatmentId + row.time}>
                        <TableCell>
                          <strong className="medication-name" title={row.name}>
                            {row.name}
                          </strong>
                          <span>
                            {row.time} ·{" "}
                            {t(row.required ? "Plan asignado" : "Adicional")}
                          </span>
                        </TableCell>
                        {data.days.map((day) => {
                          const item = data.doses.find(
                            (d) =>
                              d.localDate === day.date &&
                              d.dose.treatmentId === row.treatmentId &&
                              fmt.time(d.dose.scheduledAt, data.timeZone) ===
                                row.time,
                          );
                          return (
                            <TableCell key={day.date}>
                              {item ? (
                                <button
                                  className={
                                    "medication-week-cell timing-" + item.timing
                                  }
                                  onClick={() => setSelected(day.date)}
                                  aria-label={
                                    row.name +
                                    " " +
                                    day.date +
                                    " " +
                                    t(timingLabels[item.timing])
                                  }
                                >
                                  <strong>
                                    {item.dose.status === "taken" &&
                                    item.dose.occurredAt
                                      ? fmt.time(
                                          item.dose.occurredAt,
                                          data.timeZone,
                                        )
                                      : "·"}
                                  </strong>
                                  <span>{t(timingLabels[item.timing])}</span>
                                </button>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell>{t("Adherencia al plan")}</TableCell>
                      {data.days.map((d) => (
                        <TableCell key={d.date}>
                          <strong>
                            {d.percent === null ? "—" : d.percent + "%"}
                          </strong>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </section>
              <section
                className="medication-monitoring-card"
                aria-label={t("Detalle del día")}
              >
                <div className="medication-monitoring-toolbar">
                  <h2>
                    {t("Detalle del día")} · {fmt.date(selectedDate)}
                  </h2>
                  <Badge variant="outline">
                    {detail.length} {t("Tomas programadas")}
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        "Medicamento",
                        "Programada",
                        "Registrada",
                        "Estado",
                        "Diferencia",
                        "Plan",
                      ].map((x) => (
                        <TableHead key={x}>{t(x)}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.map((d) => (
                      <TableRow key={d.dose.id}>
                        <TableCell>{d.dose.name}</TableCell>
                        <TableCell>
                          {fmt.time(d.dose.scheduledAt, data.timeZone)}
                        </TableCell>
                        <TableCell>
                          {d.dose.occurredAt
                            ? fmt.time(d.dose.occurredAt, data.timeZone)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {t(timingLabels[d.timing])}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {d.delayMinutes === null
                            ? "—"
                            : d.delayMinutes + " min"}
                        </TableCell>
                        <TableCell>
                          {t(d.isRequired ? "Plan asignado" : "Adicional")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!detail.length && (
                  <p className="medication-empty-line">
                    {t("Sin tomas programadas para este día")}
                  </p>
                )}
              </section>
            </>
          )
        )
      ) : (
        <MedicationTrackingEmpty onChoose={choosePatient} />
      )}
    </>
  );
}
