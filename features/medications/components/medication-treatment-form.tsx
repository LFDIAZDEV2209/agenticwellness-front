"use client";

import { useRef, useState, type FormEvent } from "react";
import { CalendarDays, Clock3, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/http";
import { useT } from "@/providers/i18n-provider";
import { CatalogCombobox } from "@/features/patients/components/catalog-combobox";
import { medicationErrorKey, useMedicationCapabilities } from "../hooks";
import {
  createMedicationTreatment,
  updateMedicationRegimen,
  searchUsMedicationCatalog,
  type RxTermsOption,
} from "../services";
import type { MedicationProductType, MedicationTreatment } from "../types";
import { MedicationError } from "./medication-shared";

const rxTermsLabel = (item: RxTermsOption) => item.name;
const frequencyPresets = [
  { label: "1 vez al día", firstTime: "08:00", interval: null },
  { label: "Cada 8 horas", firstTime: "06:00", interval: 8 },
  { label: "Cada 12 horas", firstTime: "08:00", interval: 12 },
] as const;

export function MedicationTreatmentForm({
  patientId,
  treatment,
  onSaved,
  onCancel,
}: {
  patientId: string;
  treatment?: MedicationTreatment;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const capabilities = useMedicationCapabilities();
  const [productType, setProductType] =
    useState<MedicationProductType>(treatment?.productType ?? "medication");
  const [selectedDrug, setSelectedDrug] = useState<RxTermsOption | null>(null);
  const [times, setTimes] = useState(treatment?.times ?? ["08:00"]);
  const [frequency, setFrequency] = useState(treatment?.intervalHours ? "interval" : treatment?.weekdayMask ? "weekly" : "daily");
  const [intervalHours, setIntervalHours] = useState(String(treatment?.intervalHours ?? 8));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const zone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";

  function applyFrequencyPreset(preset: typeof frequencyPresets[number]) {
    setFrequency(preset.interval === null ? "daily" : "interval");
    setTimes([preset.firstTime]);
    if (preset.interval !== null) setIntervalHours(String(preset.interval));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const weekdayMask = form.getAll("weekday").reduce<number>((mask, day) => mask | (1 << Number(day)), 0);
    const override = (field: string) => form.get(field) === "yes" ? true : form.get(field) === "no" ? false : null;
    const minutes = (field: string) => form.get(field) ? Number(form.get(field)) : null;
    const body = {
      medicationId: null,
      rxCui: selectedDrug?.id,
      name: selectedDrug?.name ?? String(form.get("name") ?? "").trim(),
      productType,
      dosage: Number(form.get("dosage")),
      unit: String(form.get("unit") ?? "").trim(),
      route: String(form.get("route") ?? "").trim(),
      instructions: String(form.get("instructions") ?? "").trim(),
      times,
      weekdayMask: frequency === "weekly" ? weekdayMask : null,
      intervalHours: frequency === "interval" ? Number(form.get("intervalHours")) : null,
      reminders: {
        push: override("push"), inApp: override("inApp"), whatsApp: override("whatsApp"),
        leadMinutes: minutes("leadMinutes"), followUpMinutes: minutes("followUpMinutes"),
      },
      timeZone: String(form.get("timeZone") ?? "").trim(),
      startDate: String(form.get("startDate") ?? ""),
      endDate: String(form.get("endDate") ?? "") || null,
    };
    if (
      new Set(times).size !== times.length ||
      (body.endDate && body.endDate < body.startDate)
    ) {
      setError(t("Revisa los horarios y las fechas."));
      return;
    }
    const signature = JSON.stringify(body);
    if (operation.current?.signature !== signature)
      operation.current = { signature, id: crypto.randomUUID() };
    setSaving(true);
    setError(null);
    try {
      if (treatment) {
        await updateMedicationRegimen(patientId, treatment.id, { ...body, expectedRevision: treatment.revision });
      } else {
        await createMedicationTreatment(patientId, { ...body, clientRequestId: operation.current!.id });
      }
      onSaved();
    } catch (issue) {
      setError(t(medicationErrorKey(issue)));
      if (issue instanceof ApiError && issue.status === 403)
        capabilities.retry();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="medication-form"
      aria-labelledby="medication-form-title"
      onSubmit={save}
    >
      <div className="medication-form-heading">
        <div>
          <h2 id="medication-form-title">{t(treatment ? "Editar dosis y horarios" : "Nuevo tratamiento")}</h2>
          {treatment ? <p>{treatment.name}</p> : <p>{t(productType === "supplement" ? "Nutracéutico adicional" : "Se asignará al plan obligatorio del paciente.")}</p>}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("Cerrar formulario")}
          onClick={onCancel}
          disabled={saving}
        >
          <X aria-hidden />
        </Button>
      </div>
      {error && <MedicationError message={error} />}
      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!treatment && <>
        <Field>
          {!selectedDrug && (
            <>
              <FieldLabel htmlFor="medication-name">
                {t("Nombre del producto")}
              </FieldLabel>
              <Input
                id="medication-name"
                name="name"
                required
                maxLength={200}
                autoFocus
                disabled={saving}
              />
            </>
          )}
          {productType === "medication" && (
            <CatalogCombobox
              value={selectedDrug}
              onSelect={setSelectedDrug}
              fetchItems={searchUsMedicationCatalog}
              getLabel={rxTermsLabel}
              placeholder={t("Buscar en catálogo de EE. UU.")}
              ariaLabel={t("Buscar en catálogo de EE. UU.")}
              searchPlaceholder={t("Marca, ingrediente o RxCUI")}
              emptyText={t("Sin coincidencias en RxTerms.")}
              allowClear
              wrapOptions
              minChars={3}
              disabled={saving}
            />
          )}
          {selectedDrug && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => setSelectedDrug(null)}
              disabled={saving}
            >
              {t("Escribir nombre manualmente")}
            </Button>
          )}
        </Field>
        <Field>
          <FieldLabel>{t("Tipo de producto")}</FieldLabel>
          <NativeSelect
            ariaLabel={t("Tipo de producto")}
            value={productType}
            disabled={saving}
            onChange={(value) => {
              setProductType(value as MedicationProductType);
              if (value !== "medication") setSelectedDrug(null);
            }}
            options={[
              { value: "medication", label: t("Medicamento") },
              { value: "vitamin", label: t("Vitamina") },
              { value: "supplement", label: t("Suplemento") },
            ]}
          />
        </Field>
        </>}
        <Field>
          <FieldLabel htmlFor="medication-quantity">
            {t("Cantidad por toma")}
          </FieldLabel>
          <Input
            key={selectedDrug?.id ?? "manual"}
            id="medication-quantity"
            name="dosage"
            type="number"
            min="0.001"
            max="1000000"
            step="any"
            defaultValue={treatment?.dosage ?? (selectedDrug ? "" : "1")}
            required
            disabled={saving}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="medication-unit">{t("Unidad")}</FieldLabel>
          <Input
            key={selectedDrug?.id ?? "manual"}
            id="medication-unit"
            name="unit"
            maxLength={40}
            defaultValue={treatment?.unit ?? (selectedDrug ? "" : "tableta")}
            required
            disabled={saving}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="medication-route">{t("Vía")}</FieldLabel>
          <Input
            key={selectedDrug?.id ?? "manual"}
            id="medication-route"
            name="route"
            maxLength={80}
            defaultValue={treatment?.route ?? (selectedDrug ? "" : "oral")}
            required={selectedDrug !== null}
            disabled={saving}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="medication-zone">{t("Zona horaria")}</FieldLabel>
          <Input
            id="medication-zone"
            name="timeZone"
            defaultValue={treatment?.timeZone ?? zone}
            required
            disabled={saving}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="medication-start">
            <CalendarDays aria-hidden className="size-4" />
            {t("Fecha de inicio")}
          </FieldLabel>
          <Input
            id="medication-start"
            name="startDate"
            type="date"
            defaultValue={treatment?.startDate ?? new Date().toLocaleDateString("en-CA")}
            required
            disabled={saving}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="medication-end">
            {t("Fecha de fin (opcional)")}
          </FieldLabel>
          <Input
            id="medication-end"
            name="endDate"
            defaultValue={treatment?.endDate ?? ""}
            type="date"
            disabled={saving}
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("Atajos de frecuencia")}>
        {frequencyPresets.map(preset => (
          <Button key={preset.label} type="button" variant="outline" size="sm" disabled={saving}
            onClick={() => applyFrequencyPreset(preset)}>
            {t(preset.label)}
          </Button>
        ))}
      </div>
      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t("Frecuencia")}</FieldLabel>
          <NativeSelect
            ariaLabel={t("Frecuencia")} value={frequency} disabled={saving}
            options={[
              { value: "daily", label: t("Horarios diarios") },
              { value: "interval", label: t("Cada N horas") },
              { value: "weekly", label: t("Días específicos") },
            ]}
            onChange={(value) => {
              setFrequency(value);
              if (value === "interval") setTimes(([first]) => [first]);
            }}
          />
        </Field>
        {frequency === "interval" && <Field>
          <FieldLabel htmlFor="medication-interval">{t("Horas entre tomas")}</FieldLabel>
          <Input id="medication-interval" name="intervalHours" type="number" min={3} max={168}
            value={intervalHours} onChange={event => setIntervalHours(event.target.value)} required disabled={saving} />
        </Field>}
      </FieldGroup>
      {frequency === "weekly" && (
        <fieldset className="medication-times">
          <legend>{t("Días de la semana")}</legend>
          <div className="flex flex-wrap gap-3">
            {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((label, index) => (
              <label key={label} className="flex items-center gap-2">
                <input type="checkbox" name="weekday" value={index} disabled={saving}
                  defaultChecked={Boolean((treatment?.weekdayMask ?? 31) & (1 << index))} />
                {t(label)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="medication-times">
        <legend>
          <Clock3 aria-hidden />
          {t("Horarios")}
        </legend>
        <div>
          {times.map((time, index) => (
            <div className="medication-time-input" key={index}>
              <Input
                type="time"
                aria-label={t("Horario {number}", {
                  number: String(index + 1),
                })}
                value={time}
                required
                disabled={saving}
                onChange={(event) =>
                  setTimes((current) =>
                    current.map((value, position) =>
                      position === index ? event.target.value : value,
                    ),
                  )
                }
              />
              {times.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("Eliminar horario {number}", {
                    number: String(index + 1),
                  })}
                  onClick={() =>
                    setTimes((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                  disabled={saving}
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setTimes((current) => [...current, "20:00"])}
            disabled={saving || times.length >= 8 || frequency === "interval"}
          >
            <Plus data-icon="inline-start" aria-hidden />
            {t("Añadir horario")}
          </Button>
        </div>
      </fieldset>
      <Field>
        <FieldLabel htmlFor="medication-instructions">
          {t("Indicaciones")}
        </FieldLabel>
        <Textarea
          id="medication-instructions"
          name="instructions"
          defaultValue={treatment?.instructions ?? ""}
          maxLength={2000}
          rows={3}
          disabled={saving}
        />
      </Field>
      <details>
        <summary>{t("Recordatorios de medicación")}</summary>
        <FieldGroup className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {([
            ["push", "Notificaciones push"],
            ["inApp", "Avisos en la app"],
            ["whatsApp", "WhatsApp"],
          ] as const).map(([field, label]) => (
            <Field key={field}>
              <FieldLabel htmlFor={`medication-${field}`}>{t(label)}</FieldLabel>
              <select id={`medication-${field}`} name={field} className="rounded-md border bg-background p-2"
                defaultValue={treatment?.reminders?.[field] == null ? "" : treatment.reminders[field] ? "yes" : "no"}
                disabled={saving}>
                <option value="">{t("Preferencia del paciente")}</option>
                <option value="yes">{t("Activado")}</option>
                <option value="no">{t("Desactivado")}</option>
              </select>
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="medication-lead">{t("Anticipación (minutos)")}</FieldLabel>
            <Input id="medication-lead" name="leadMinutes" type="number" min={0} max={30}
              defaultValue={treatment?.reminders?.leadMinutes ?? ""} disabled={saving} />
          </Field>
          <Field>
            <FieldLabel htmlFor="medication-retry">{t("Segundo aviso (minutos)")}</FieldLabel>
            <Input id="medication-retry" name="followUpMinutes" type="number" min={15} max={90}
              defaultValue={treatment?.reminders?.followUpMinutes ?? ""} disabled={saving} />
          </Field>
        </FieldGroup>
      </details>
      <div className="medication-form-actions">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          {t("Cancelar")}
        </Button>
        <Button type="submit" disabled={saving}>
          <Save data-icon="inline-start" aria-hidden />
          {t(saving ? "Guardando..." : treatment ? "Guardar cambios" : "Guardar tratamiento")}
        </Button>
      </div>
    </form>
  );
}
