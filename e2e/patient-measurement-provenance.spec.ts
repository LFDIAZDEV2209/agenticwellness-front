import { expect, test, type Page } from "@playwright/test";
import type { ClinicalMeasurementDto, Patient } from "../features/patients/types";
import { mockPatientsHttp, patientWorkspaceRows } from "./fixtures/patients-http";

const patientId = patientWorkspaceRows[1].patientId;
const patientPath = `/api/v1/patients/${patientId}`;
const patient = {
  id: patientId,
  medicalRecordNumber: "QA-4.7",
  firstName: "Paciente",
  lastName: "QA",
  status: "Activo",
  diagnoses: [],
  medications: [],
  allergies: [],
  vitalSigns: [],
} satisfies Partial<Patient>;

const weight: ClinicalMeasurementDto = {
  id: "weight",
  metricCode: "weight",
  metricName: "Peso",
  value: 74.5,
  unitCode: "kg",
  unitSymbol: "kg",
  observedAt: "2026-11-18T14:00:00Z",
  source: "vita",
  batchId: "mixed-batch",
  reportedBy: "patient",
  sourceChannel: "vita_whatsapp",
  status: "confirmed",
};

const superseded: ClinicalMeasurementDto = {
  ...weight,
  id: "superseded",
  value: 75.5,
  status: "superseded",
};

const measurements: ClinicalMeasurementDto[] = [
  weight,
  {
    ...weight,
    id: "professional",
    metricCode: "systolic_bp",
    metricName: "Presión sistólica",
    value: 112,
    unitCode: "mmHg",
    unitSymbol: "mmHg",
    source: "professional",
    sourceChannel: "professional",
    reportedBy: "professional",
  },
  {
    ...weight,
    id: "device",
    metricCode: "o2_saturation",
    metricName: "Saturación O₂",
    value: 98,
    unitCode: "%",
    unitSymbol: "%",
    source: "device",
    sourceChannel: "device",
    reportedBy: "device",
  },
  {
    ...weight,
    id: "lab",
    metricCode: "glucose_fasting",
    metricName: "Glucosa",
    value: 94,
    unitCode: "mg/dL",
    unitSymbol: "mg/dL",
    source: "lab",
    sourceChannel: "lab",
    reportedBy: null,
  },
  { ...weight, id: "voice", value: 74.6, sourceChannel: "vita_voice" },
  { ...weight, id: "chat", value: 74.7, sourceChannel: "vita_chat" },
  superseded,
  {
    id: "legacy",
    metricCode: "heart_rate",
    metricName: "Frecuencia cardíaca",
    value: 69,
    unitCode: "bpm",
    unitSymbol: "bpm",
    observedAt: "2026-11-16T15:00:00Z",
    source: "legacy",
    batchId: null,
  },
];

async function openMeasurements(
  page: Page,
  baseUrl: string | undefined,
  english: boolean,
  data: ClinicalMeasurementDto[],
) {
  const workspace = await mockPatientsHttp(page, { baseUrl, english });
  const pageErrors: string[] = [];
  const missingTranslations: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("[i18n] Missing key")) missingTranslations.push(text);
  });

  await page.route(`**${patientPath}`, (route) => route.fulfill({ json: patient }));
  await page.route(`**${patientPath}/professionals`, (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/professionals-catalog?*", (route) =>
    route.fulfill({ json: { data: [], page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
  );
  await page.route(`**${patientPath}/measurements`, (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: data });
  });

  await page.goto(`/patients/${patientId}`);
  await page.getByRole("tab", { name: english ? "Clinical" : "Clínico", exact: true }).click();

  return {
    panel: page.getByRole("region", { name: english ? "Clinical measurements" : "Mediciones clínicas" }),
    workspace,
    pageErrors,
    missingTranslations,
  };
}

for (const english of [false, true]) {
  for (const width of [320, 390, 1440]) {
    const lang = english ? "en" : "es";
    test(`procedencia e historial clínico · ${lang} · ${width}px`, async ({ page, baseURL }, info) => {
      await page.setViewportSize({ width, height: 844 });
      const { panel, workspace, pageErrors, missingTranslations } =
        await openMeasurements(page, baseURL, english, measurements);
      const count = english ? "7 measurements recorded" : "7 mediciones registradas";
      const vita = english ? "Self-reported" : "Auto-reporte";
      const replaced = english ? "Superseded" : "Reemplazado";
      const correction = english ? "75.5 kg" : "75,5 kg";

      await expect(panel.getByText(count, { exact: true })).toBeVisible();
      const vitaRow = panel.getByRole("listitem").filter({
        has: page.getByText(english ? "74.5 kg" : "74,5 kg", { exact: true }),
      }).last();
      const professionalRow = panel.getByRole("listitem").filter({
        has: page.getByText("112 mmHg", { exact: true }),
      }).last();
      await expect(vitaRow.getByRole("group", { name: `${vita} · WhatsApp`, exact: true })).toBeVisible();
      await expect(professionalRow.getByRole("group", { name: english ? "Professional" : "Profesional" })).toBeVisible();
      await expect(professionalRow.getByText(english ? "Systolic blood pressure" : "Presión sistólica")).toBeVisible();
      for (const provenance of [
        `${vita} · Chat`,
        `${vita} · ${english ? "Voice" : "Voz"}`,
        english ? "Device" : "Dispositivo",
        english ? "Laboratory" : "Laboratorio",
      ]) {
        await expect(panel.getByRole("group", { name: provenance, exact: true })).toBeVisible();
      }
      const legacyRow = panel.getByRole("listitem").filter({
        has: page.getByText("69 bpm", { exact: true }),
      }).last();
      await expect(legacyRow.getByText("69 bpm")).toBeVisible();
      await expect(legacyRow.getByRole("group")).toHaveCount(0);
      await expect(panel.getByText(correction, { exact: true })).toHaveCount(0);

      const history = panel.getByRole("button", { name: english ? "View history" : "Ver historial", exact: true });
      await expect(history).toHaveAttribute("aria-expanded", "false");
      await history.click({ trial: true });
      await history.press("Enter");
      const collapse = panel.getByRole("button", { name: english ? "Show less" : "Ver menos", exact: true });
      await expect(collapse).toHaveAttribute("aria-expanded", "true");
      await expect(collapse).toBeFocused();
      const historicalRow = panel.getByRole("listitem").filter({
        has: page.getByText(correction, { exact: true }),
      }).last();
      await expect(historicalRow.getByRole("group", { name: replaced })).toBeVisible();
      await expect(panel.getByText(count, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await collapse.click({ trial: true });

      // El panel expandido puede superar la altura del área desplazable en móvil.
      await page.setViewportSize({ width, height: 1200 });
      const evidence = info.outputPath(`provenance-${lang}-${width}.png`);
      await panel.screenshot({ path: evidence, animations: "disabled" });
      await info.attach("Mediciones clínicas", { path: evidence, contentType: "image/png" });

      await collapse.press("Space");
      await expect(panel.getByText(correction, { exact: true })).toHaveCount(0);
      expect(workspace.writes).toEqual([]);
      expect(workspace.unknowns).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(missingTranslations).toEqual([]);
    });
  }
}

test("las mediciones reemplazadas siguen disponibles cuando no hay mediciones vigentes", async ({ page, baseURL }) => {
  const { panel } = await openMeasurements(page, baseURL, false, [superseded]);
  await expect(panel.getByText("0 mediciones registradas", { exact: true })).toBeVisible();
  await expect(panel.getByText("75,5 kg", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Ver historial (1)", exact: true }).click();
  await expect(panel.getByText("75,5 kg", { exact: true })).toBeVisible();
  await expect(panel.getByRole("group", { name: "Reemplazado" })).toBeVisible();
});
