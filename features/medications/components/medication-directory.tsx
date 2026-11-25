"use client";

import { useCallback, useDeferredValue, useState } from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {MedicationModuleNav} from "./medication-module-nav";
import {
  ArrowRight,
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  Pill,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n, useT } from "@/providers/i18n-provider";
import {
  medicationErrorKey,
  useMedicationCapabilities,
  useMedicationResource,
} from "../hooks";
import { fetchMedicationOverview, fetchMedicationPatients } from "../services";
import {
  MedicationOverviewPanel,
  medicationPatientHref,
  type MedicationDirectoryIntent,
} from "./medication-overview";
import {
  MedicationEmpty,
  MedicationError,
  MedicationLoading,
  MedicationUnavailable,
} from "./medication-shared";
import "../medications.css";

export function MedicationDirectory({initialView = "overview"}:{initialView?:"overview"|"patients"}) {
  const capabilities = useMedicationCapabilities();
  if (capabilities.loading)
    return (
      <div className="medication-page">
        <MedicationLoading />
      </div>
    );
  if (!capabilities.canView)
    return (
      <div className="medication-page">
        <MedicationUnavailable />
      </div>
    );
  return <MedicationDirectoryContent key={capabilities.scopeKey} initialView={initialView} />;
}

function MedicationDirectoryContent({initialView}:{initialView:"overview"|"patients"}) {
  const router=useRouter();
  const t = useT();
  const { lang } = useI18n();
  const capability = useMedicationCapabilities();
  const [view, setView] = useState<"overview" | "patients">(initialView);
  const [intent, setIntent] = useState<MedicationDirectoryIntent>("patients");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query.trim());
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchMedicationPatients(deferredQuery, page, signal),
    [deferredQuery, page],
  );
  const overviewLoad = useCallback(
    (signal: AbortSignal) => fetchMedicationOverview(signal),
    [],
  );
  const { data, error, loading, retry } = useMedicationResource(load);
  const overview = useMedicationResource(overviewLoad);
  function openPatients(next: MedicationDirectoryIntent) {
    if(next === "today") {router.push("/medications/tracking");return;}
    setIntent(next);
    setView("patients");
  }
  function openOverview() {
    setView("overview");
    setQuery("");
    setPage(1);
  }
  const day =
    overview.data?.periodEnd ??
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  return (
    <div className="medication-page medication-home">
      <header className="medication-home-header">
        <div className="medication-home-title">
          <span className="medication-home-title-icon">
            <Pill aria-hidden />
          </span>
          <div>
            <h1>{t("Control de medicamentos")}</h1>
            <p>{t("Tratamientos, tomas y seguimiento.")}</p>
          </div>
        </div>
        <div className="medication-home-header-actions">
          <span className="medication-home-date">
            <CalendarDays aria-hidden />
            <time dateTime={day}>
              {new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CO", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${day}T12:00:00Z`))}
            </time>
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Actualizar")}
            onClick={() => {
              retry();
              overview.retry();
            }}
            disabled={loading || overview.loading}
          >
            <RefreshCw aria-hidden />
          </Button>
          {capability.canManage && (
            <Button onClick={() => openPatients("create")}>
              <Plus aria-hidden />
              {t("Nuevo tratamiento")}
            </Button>
          )}
        </div>
      </header>
      <MedicationModuleNav current={view} onHome={openOverview} onPatients={() => openPatients("patients")} />
      {view === "overview" ? (
        <>
          {overview.loading ? (
            <MedicationLoading />
          ) : overview.error ? (
            <MedicationError
              message={t(medicationErrorKey(overview.error))}
              retry={overview.retry}
            />
          ) : (
            overview.data && (
              <MedicationOverviewPanel
                data={overview.data}
                patients={data?.items ?? []}
                patientsLoading={loading}
                canManage={capability.canManage}
                canManageAccess={capability.canManageAccess}
                onOpen={openPatients}
              />
            )
          )}
          {error && (
            <MedicationError
              message={t(medicationErrorKey(error))}
              retry={retry}
            />
          )}
        </>
      ) : (
        <>
          {intent !== "patients" && (
            <div className="medication-home-intent">
              <span>
                <UserRound aria-hidden />
              </span>
              <div>
                <strong>
                  {t(
                    intent === "history"
                      ? "Historial de tomas"
                      : intent === "create"
                        ? "Registrar tratamiento"
                        : intent === "access"
                          ? "Gestionar accesos"
                          : "Seguimiento diario",
                  )}
                </strong>
                <p>{t("Selecciona un paciente")}</p>
              </div>
            </div>
          )}
          <section
            className="medication-directory"
            aria-label={t("Personas en control de medicamentos")}
          >
            <div className="medication-directory-toolbar">
              <div className="medication-section-heading">
                <span className="medication-icon">
                  <UserRound aria-hidden />
                </span>
                <div>
                  <h2>{t("Personas")}</h2>
                  {data && (
                    <p>
                      {t("{count} personas", { count: String(data.total) })}
                    </p>
                  )}
                </div>
              </div>
              <div className="medication-search">
                <Search aria-hidden />
                <Input
                  aria-label={t("Buscar paciente")}
                  placeholder={t("Buscar paciente")}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div className="medication-directory-columns" aria-hidden>
              <span>{t("Paciente")}</span>
              <span>{t("Acceso en la app")}</span>
              <span>{t("Tratamientos activos")}</span>
              <span />
            </div>
            {loading ? (
              <MedicationLoading />
            ) : error ? (
              <div className="p-5">
                <MedicationError
                  message={t(medicationErrorKey(error))}
                  retry={retry}
                />
              </div>
            ) : data?.items.length ? (
              <div>
                {data.items.map((patient) => (
                  <Link
                    className="medication-patient-row"
                    href={medicationPatientHref(patient.patientId, intent)}
                    key={patient.patientId}
                  >
                    <div className="medication-patient-identity">
                      <span className="medication-avatar" aria-hidden>
                        {patient.name
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")}
                      </span>
                      <div className="min-w-0">
                        <strong
                          className="medication-name"
                          title={patient.name}
                        >
                          {patient.name}
                        </strong>
                        <span className="medication-mrn">{patient.mrn}</span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      tone={patient.enabled ? "teal" : "slate"}
                    >
                      {patient.enabled ? <ShieldCheck aria-hidden /> : null}
                      {t(patient.enabled ? "Habilitado" : "Sin acceso")}
                    </Badge>
                    <span className="medication-treatment-count">
                      <Pill aria-hidden />
                      {patient.activeTreatments}
                      <span className="sr-only">
                        {t("Tratamientos activos")}
                      </span>
                    </span>
                    <ArrowRight className="medication-row-arrow" aria-hidden />
                  </Link>
                ))}
              </div>
            ) : (
              <MedicationEmpty kind="patients" />
            )}
            {data && (
              <div className="medication-pagination">
                <span>
                  {t("Página {page} de {pages}", {
                    page: String(data.page),
                    pages: String(
                      Math.max(1, Math.ceil(data.total / data.pageSize)),
                    ),
                  })}
                </span>
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || loading}
                    aria-label={t("Página anterior")}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    <ChevronLeft aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page * data.pageSize >= data.total || loading}
                    aria-label={t("Página siguiente")}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
