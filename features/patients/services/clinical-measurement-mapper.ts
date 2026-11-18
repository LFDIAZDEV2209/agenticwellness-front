import type { ClinicalMeasurementDto } from "../types";

const VITA_CHANNEL_LABELS = {
  vita_chat: "Auto-reporte · Chat",
  vita_voice: "Auto-reporte · Voz",
  vita_whatsapp: "Auto-reporte · WhatsApp",
} as const;

function getSourceLabel({ sourceChannel, reportedBy, source }: ClinicalMeasurementDto) {
  if (sourceChannel === "lab") return "Laboratorio";
  if (reportedBy === "device" || sourceChannel === "device") return "Dispositivo";
  if (reportedBy === "professional" || sourceChannel === "professional") return "Profesional";
  if (reportedBy === "patient") {
    switch (sourceChannel) {
      case "vita_chat":
      case "vita_voice":
      case "vita_whatsapp":
        return VITA_CHANNEL_LABELS[sourceChannel];
      default:
        return "Auto-reporte";
    }
  }

  // Respuestas anteriores al despliegue de procedencia por medición.
  if (sourceChannel == null && source === "lab") return "Laboratorio";
  if (sourceChannel === "app_manual" || (sourceChannel == null && source === "mobile")) {
    return "App móvil";
  }
  return null;
}

export function mapClinicalMeasurement(measurement: ClinicalMeasurementDto) {
  return {
    ...measurement,
    sourceLabel: getSourceLabel(measurement),
    isSuperseded: measurement.status === "superseded",
  };
}

export type ClinicalMeasurement = ReturnType<typeof mapClinicalMeasurement>;
