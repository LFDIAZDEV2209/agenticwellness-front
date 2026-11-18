import assert from "node:assert/strict";
import { test } from "node:test";
import { mapClinicalMeasurement } from "../features/patients/services/clinical-measurement-mapper.ts";

const legacyMeasurement = {
  id: "weight-1",
  metricCode: "weight",
  metricName: "Peso",
  value: 74.5,
  unitCode: "kg",
  unitSymbol: "kg",
  observedAt: "2026-11-18T14:00:00Z",
  source: "mobile",
  batchId: null,
};

test("identifica los tres canales de Vita cuando el paciente reportó la medición", () => {
  const channels = [
    ["vita_chat", "Auto-reporte · Chat"],
    ["vita_voice", "Auto-reporte · Voz"],
    ["vita_whatsapp", "Auto-reporte · WhatsApp"],
  ];
  for (const [sourceChannel, sourceLabel] of channels) {
    assert.deepEqual(
      mapClinicalMeasurement({
        ...legacyMeasurement,
        sourceChannel,
        reportedBy: "patient",
        status: "confirmed",
      }),
      { ...legacyMeasurement, sourceChannel, reportedBy: "patient", status: "confirmed", sourceLabel, isSuperseded: false },
    );
  }
});

test("distingue profesional, dispositivo y laboratorio sin inferir el autor de un canal Vita", () => {
  const cases = [
    [{ sourceChannel: "vita_voice", reportedBy: "professional" }, "Profesional"],
    [{ sourceChannel: "vita_voice", reportedBy: null }, null],
    [{ sourceChannel: "device" }, "Dispositivo"],
    [{ reportedBy: "device" }, "Dispositivo"],
    [{ sourceChannel: "lab", reportedBy: "professional" }, "Laboratorio"],
    [{ sourceChannel: "app_manual", reportedBy: "patient" }, "Auto-reporte"],
  ];
  for (const [provenance, sourceLabel] of cases) {
    assert.equal(mapClinicalMeasurement({ ...legacyMeasurement, ...provenance }).sourceLabel, sourceLabel);
  }
});

test("conserva valores de mediciones antiguas con procedencia ausente o nula", () => {
  assert.deepEqual(mapClinicalMeasurement(legacyMeasurement), {
    ...legacyMeasurement,
    sourceLabel: "App móvil",
    isSuperseded: false,
  });
  assert.equal(mapClinicalMeasurement({ ...legacyMeasurement, source: "lab" }).sourceLabel, "Laboratorio");
  assert.deepEqual(
    mapClinicalMeasurement({ ...legacyMeasurement, source: "unknown", sourceChannel: null, reportedBy: null }),
    { ...legacyMeasurement, source: "unknown", sourceChannel: null, reportedBy: null, sourceLabel: null, isSuperseded: false },
  );
});

test("marca la medición reemplazada y conserva sus datos para el historial", () => {
  const replaced = { ...legacyMeasurement, status: "superseded" };
  assert.deepEqual(mapClinicalMeasurement(replaced), {
    ...replaced,
    sourceLabel: "App móvil",
    isSuperseded: true,
  });
  assert.equal(mapClinicalMeasurement({ ...legacyMeasurement, status: "pending_confirmation" }).isSuperseded, false);
});
