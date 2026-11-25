"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCheck,
  FileClock,
  Pill,
  Plus,
  ShieldCheck,
  Smartphone,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n, useT } from "@/providers/i18n-provider";
import type { MedicationOverview, MedicationPatient } from "../types";
import { MedicationLoading } from "./medication-shared";

export type MedicationDirectoryIntent =
  "patients" | "today" | "history" | "create" | "access";
export function medicationPatientHref(
  id: string,
  intent: MedicationDirectoryIntent,
) {
  const suffix =
    intent === "history"
      ? "?tab=history"
      : intent === "create"
        ? "?action=create"
        : "";
  return `/medications/${encodeURIComponent(id)}${suffix}`;
}

export function MedicationOverviewPanel({
  data,
  patients,
  patientsLoading,
  canManage,
  canManageAccess,
  onOpen,
}: {
  data: MedicationOverview;
  patients: MedicationPatient[];
  patientsLoading: boolean;
  canManage: boolean;
  canManageAccess: boolean;
  onOpen: (intent: MedicationDirectoryIntent) => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const locale = lang === "en" ? "en-US" : "es-CO";
  const taken = data.activity.reduce((sum, day) => sum + day.taken, 0);
  const omitted = data.activity.reduce((sum, day) => sum + day.omitted, 0);
  const max = Math.max(
    1,
    ...data.activity.map((day) => day.taken + day.omitted),
  );
  const metrics = [
    {
      label: "Personas",
      value: data.totalPatients,
      icon: UsersRound,
      tone: "blue",
    },
    {
      label: "Tratamientos activos",
      value: data.activeTreatments,
      icon: Pill,
      tone: "teal",
    },
    {
      label: "Con acceso en la app",
      value: data.enabledPatients,
      icon: Smartphone,
      tone: "violet",
    },
    {
      label: "Tomadas hoy",
      value: data.takenToday,
      icon: CheckCheck,
      tone: "amber",
    },
  ];
  const actions = [
    {
      label: "Personas",
      subtitle: "Tu directorio de seguimiento",
      icon: UsersRound,
      tone: "blue",
      intent: "patients" as const,
    },
    {
      label: "Seguimiento diario",
      subtitle: "Tomas y horarios del día",
      icon: CalendarClock,
      tone: "teal",
      intent: "today" as const,
    },
    {
      label: "Historial de tomas",
      subtitle: "Registros y correcciones",
      icon: FileClock,
      tone: "violet",
      intent: "history" as const,
    },
    ...(canManage
      ? [
          {
            label: "Registrar tratamiento",
            subtitle: "Añadir a un paciente",
            icon: Plus,
            tone: "amber",
            intent: "create" as const,
          },
        ]
      : []),
  ];
  return (
    <>
      <section
        className="medication-home-metrics"
        aria-label={t("Resumen de medicamentos")}
      >
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <article
            className={`medication-home-metric medication-accent-${tone}`}
            key={label}
          >
            <div>
              <span>{t(label)}</span>
              <strong>{value.toLocaleString(locale)}</strong>
            </div>
            <span className="medication-home-metric-icon">
              <Icon aria-hidden />
            </span>
          </article>
        ))}
      </section>

      <section
        className="medication-home-actions"
        aria-label={t("Accesos de medicamentos")}
      >
        {actions.map(({ label, subtitle, icon: Icon, tone, intent }) => (
          <button
            type="button"
            key={intent}
            className={`medication-home-action medication-accent-${tone}`}
            aria-label={t(label)}
            onClick={() => onOpen(intent)}
          >
            <span className="medication-home-action-icon">
              <Icon aria-hidden />
            </span>
            <ArrowUpRight
              className="medication-home-action-arrow"
              aria-hidden
            />
            <strong>{t(label)}</strong>
            <span>{t(subtitle)}</span>
          </button>
        ))}
      </section>

      <div className="medication-home-insights">
        <section
          className="medication-home-activity"
          aria-labelledby="medication-activity-title"
        >
          <header>
            <div>
              <span className="medication-home-eyebrow">
                {t("Tu seguimiento")}
              </span>
              <h2 id="medication-activity-title">{t("Actividad semanal")}</h2>
            </div>
            <span className="medication-home-period">
              {t("Últimos 7 días")}
            </span>
          </header>
          <div className="medication-home-plot">
            {taken + omitted === 0 ? (
              <div className="medication-home-no-activity">
                <span>
                  <CalendarClock aria-hidden />
                </span>
                <strong>{t("Sin registros esta semana")}</strong>
                <p>{t("Las tomas aparecerán aquí.")}</p>
              </div>
            ) : (
              <div className="medication-home-bars" aria-hidden>
                {data.activity.map((day) => (
                  <div className="medication-home-bar-column" key={day.date}>
                    <span
                      style={{
                        bottom: `calc(${((day.taken + day.omitted) / max) * 100}% + 3px)`,
                      }}
                    >
                      {day.taken + day.omitted || ""}
                    </span>
                    <div
                      className="medication-home-bar-stack"
                      style={{
                        height: `${((day.taken + day.omitted) / max) * 100}%`,
                      }}
                    >
                      {day.omitted > 0 && (
                        <i
                          className="medication-home-bar-omitted"
                          style={{ flex: day.omitted }}
                        />
                      )}
                      {day.taken > 0 && (
                        <i
                          className="medication-home-bar-taken"
                          style={{ flex: day.taken }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="medication-home-days" aria-hidden>
            {data.activity.map((day) => (
              <span key={day.date}>
                {new Intl.DateTimeFormat(locale, {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(`${day.date}T12:00:00Z`))}
              </span>
            ))}
          </div>
          <div className="medication-home-legend">
            <span>
              <i className="medication-home-dot-taken" />
              {t("Tomadas")}
              <b>{taken}</b>
            </span>
            <span>
              <i className="medication-home-dot-omitted" />
              {t("Omitidas")}
              <b>{omitted}</b>
            </span>
          </div>
          <table className="sr-only">
            <caption>{t("Actividad semanal")}</caption>
            <thead>
              <tr>
                <th>{t("Fecha")}</th>
                <th>{t("Tomadas")}</th>
                <th>{t("Omitidas")}</th>
              </tr>
            </thead>
            <tbody>
              {data.activity.map((day) => (
                <tr key={day.date}>
                  <th>{day.date}</th>
                  <td>{day.taken}</td>
                  <td>{day.omitted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section
          className="medication-home-access"
          aria-labelledby="medication-access-title"
        >
          <div className="medication-home-access-art" aria-hidden="true">
            <svg viewBox="0 0 420 360" preserveAspectRatio="xMidYMid slice" focusable="false">
              <circle className="medication-pattern-blue" cx="420" cy="0" r="180" />
              <circle className="medication-pattern-teal" cx="420" cy="0" r="250" />
            </svg>
          </div>
          <div className="medication-home-access-heading">
            <span>
              <Smartphone aria-hidden />
            </span>
            <span>{t("ERP + App")}</span>
            <ShieldCheck aria-hidden />
          </div>
          <h2 id="medication-access-title">
            {t("El seguimiento también va con ellos.")}
          </h2>
          <div className="medication-access-stat" aria-label={t("Acceso en la app")}>
            <strong>{new Intl.NumberFormat(locale).format(data.enabledPatients)}</strong>
            <div><span>{t("Pacientes con acceso")}</span><small>{t("de {total} pacientes", { total: new Intl.NumberFormat(locale).format(data.totalPatients) })}</small></div>
          </div>
          <Button
            variant="outline"
            className="medication-home-access-button"
            onClick={() => onOpen("access")}
          >
            {t(canManageAccess ? "Gestionar accesos" : "Ver pacientes")}
            <ArrowRight aria-hidden />
          </Button>
        </section>
      </div>

      <section
        className="medication-home-patients"
        aria-labelledby="medication-preview-title"
      >
        <header>
          <div>
            <span className="medication-home-eyebrow">
              {t("Directorio clínico")}
            </span>
            <h2 id="medication-preview-title">{t("Personas")}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpen("patients")}>
            {t("Ver todos")}
            <ArrowRight aria-hidden />
          </Button>
        </header>
        {patientsLoading ? (
          <MedicationLoading />
        ) : patients.length ? (
          <div className="medication-home-patient-grid">
            {patients.slice(0, 4).map((patient) => (
              <Link
                href={medicationPatientHref(patient.patientId, "patients")}
                key={patient.patientId}
                className="medication-home-patient"
              >
                <span className="medication-avatar" aria-hidden>
                  {patient.name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </span>
                <div>
                  <strong title={patient.name}>{patient.name}</strong>
                  <span>{patient.mrn}</span>
                </div>
                <ArrowUpRight aria-hidden />
              </Link>
            ))}
          </div>
        ) : (
          <p className="medication-home-empty-patients">
            {t("Sin pacientes en este ámbito")}
          </p>
        )}
      </section>
    </>
  );
}
