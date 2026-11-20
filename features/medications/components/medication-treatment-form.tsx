"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Pill,
  Plus,
  Save,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/http";
import { rainbowStyle } from "@/lib/ui/rainbow";
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

function TreatmentSectionHeading({
  id,
  icon: Icon,
  title,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <h3 id={id} className="medication-form-section-heading">
      <span className="medication-form-section-icon spectrum-icon"><Icon aria-hidden /></span>
      {title}
    </h3>
  );
}

export function MedicationTreatmentForm({
  patientId,
  patientName,
  treatment,
  onSaved,
  onCancel,
}: {
  patientId: string;
  patientName: string;
  treatment?: MedicationTreatment;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const capabilities = useMedicationCapabilities();
  const [productType, setProductType] =
    useState<MedicationProductType>(treatment?.productType ?? "medication");
  const [manualEntry, setManualEntry] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<RxTermsOption | null>(null);
  const [times, setTimes] = useState(treatment?.times ?? ["08:00"]);
  const [frequency, setFrequency] = useState(treatment?.intervalHours ? "interval" : treatment?.weekdayMask ? "weekly" : "daily");
  const [intervalHours, setIntervalHours] = useState(String(treatment?.intervalHours ?? 8));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const zone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";

  const usesCatalog = !treatment && productType === "medication" && !manualEntry;

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
    if (!treatment && !body.name) {
      setError(t("Escribe el nombre del producto."));
      return;
    }
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
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open && !saving) onCancel();
      }}
    >
      <DialogContent
        size="lg"
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0"
        initialFocus={() =>
          document.getElementById(treatment ? "medication-quantity" : "medication-catalog-search")
        }
      >
        <form
          className="medication-form"
          aria-labelledby="medication-form-title"
          aria-busy={saving}
          onSubmit={save}
          onInvalidCapture={(event) => {
            if (event.target instanceof HTMLElement) {
              event.target.closest("details")?.setAttribute("open", "");
            }
          }}
        >
          <header className="medication-form-heading" style={rainbowStyle("sky")}>
            <span className="medication-form-mark spectrum-icon"><Pill aria-hidden /></span>
            <div>
              <DialogTitle id="medication-form-title">
                {t(treatment ? "Editar dosis y horarios" : "Nuevo tratamiento")}
              </DialogTitle>
              <DialogDescription>
                {treatment ? `${patientName} · ${treatment.name}` : patientName}
              </DialogDescription>
            </div>
            <DialogClose
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("Cerrar formulario")}
                  className="medication-form-close"
                  disabled={saving}
                />
              }
            >
              <X aria-hidden />
            </DialogClose>
          </header>

          <DialogBody className="medication-form-body">
            {error && <MedicationError message={error} />}
            {!treatment && (
              <section className="medication-form-section" style={rainbowStyle("teal")} aria-labelledby="medication-product-heading">
                <TreatmentSectionHeading id="medication-product-heading" icon={Tag} title={t("Producto")} />
                <div className="medication-form-product">
                  <Field>
                    <div className="medication-form-product-heading">
                      {selectedDrug ? (
                        <FieldTitle>{t("Medicamento")}</FieldTitle>
                      ) : (
                        <FieldLabel htmlFor={usesCatalog ? "medication-catalog-search" : "medication-name"}>
                          {t(usesCatalog ? "Buscar en catálogo de EE. UU." : "Nombre del producto")}
                        </FieldLabel>
                      )}
                      {productType === "medication" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="medication-form-mode"
                          onClick={() => {
                            setSelectedDrug(null);
                            setManualEntry(!manualEntry);
                            setError(null);
                          }}
                          disabled={saving}
                        >
                          {t(usesCatalog ? "Entrada manual" : "Usar catálogo")}
                        </Button>
                      )}
                    </div>
                    {usesCatalog ? (
                      selectedDrug ? (
                        <div className="medication-form-selection">
                          <Check aria-hidden className="size-5 shrink-0" />
                          <span>{selectedDrug.name}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedDrug(null)}
                            disabled={saving}
                          >
                            {t("Cambiar")}
                          </Button>
                        </div>
                      ) : (
                        <CatalogCombobox
                          value={selectedDrug}
                          onSelect={setSelectedDrug}
                          fetchItems={searchUsMedicationCatalog}
                          getLabel={rxTermsLabel}
                          placeholder={t("Buscar en catálogo de EE. UU.")}
                          searchInput={{ id: "medication-catalog-search", autoFocus: true }}
                          searchPlaceholder={t("Marca, ingrediente o RxCUI")}
                          emptyText={t("Sin coincidencias en RxTerms.")}
                          wrapOptions
                          minChars={3}
                          disabled={saving}
                        />
                      )
                    ) : (
                      <Input
                        id="medication-name"
                        name="name"
                        maxLength={200}
                        required
                        autoFocus={productType === "medication"}
                        disabled={saving}
                      />
                    )}
                  </Field>
                  <Field>
                    <FieldTitle className="min-h-7 items-center">{t("Tipo de producto")}</FieldTitle>
                    <NativeSelect
                      ariaLabel={t("Tipo de producto")}
                      value={productType}
                      disabled={saving}
                      onChange={(value) => {
                        setProductType(value as MedicationProductType);
                        setSelectedDrug(null);
                        setManualEntry(false);
                      }}
                      options={[
                        { value: "medication", label: t("Medicamento") },
                        { value: "vitamin", label: t("Vitamina") },
                        { value: "supplement", label: t("Suplemento") },
                      ]}
                    />
                    <span className="medication-form-product-context spectrum-tag">
                      {t(productType === "supplement" ? "Nutracéutico adicional" : "Plan obligatorio")}
                    </span>
                  </Field>
                </div>
              </section>
            )}

            <div className="medication-form-columns">
              <section className="medication-form-section" style={rainbowStyle("violet")} aria-labelledby="medication-dose-heading">
                <TreatmentSectionHeading id="medication-dose-heading" icon={Pill} title={t("Dosis")} />
                <FieldGroup className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="medication-quantity">{t("Cantidad por toma")}</FieldLabel>
                    <Input
                      key={selectedDrug?.id ?? (usesCatalog ? "catalog" : productType)}
                      id="medication-quantity"
                      name="dosage"
                      type="number"
                      inputMode="decimal"
                      min="0.001"
                      max="1000000"
                      step="any"
                      defaultValue={treatment?.dosage ?? (usesCatalog ? "" : "1")}
                      required
                      autoFocus={selectedDrug !== null}
                      disabled={saving}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="medication-unit">{t("Unidad")}</FieldLabel>
                    <Input
                      key={selectedDrug?.id ?? (usesCatalog ? "catalog" : productType)}
                      id="medication-unit"
                      name="unit"
                      maxLength={40}
                      defaultValue={treatment?.unit ?? (usesCatalog ? "" : "tableta")}
                      required
                      disabled={saving}
                    />
                  </Field>
                  <Field className="col-span-2">
                    <FieldLabel htmlFor="medication-route">{t("Vía")}</FieldLabel>
                    <Input
                      key={selectedDrug?.id ?? (usesCatalog ? "catalog" : productType)}
                      id="medication-route"
                      name="route"
                      maxLength={80}
                      defaultValue={treatment?.route ?? (usesCatalog ? "" : "oral")}
                      required={selectedDrug !== null}
                      disabled={saving}
                    />
                  </Field>
                </FieldGroup>
              </section>

              <section className="medication-form-section" style={rainbowStyle("amber")} aria-labelledby="medication-times-heading">
                <TreatmentSectionHeading id="medication-times-heading" icon={Clock3} title={t("Horarios")} />
                <FieldGroup className="grid grid-cols-2 gap-3">
                  <Field className={frequency === "interval" ? "" : "col-span-2"}>
                    <FieldTitle>{t("Frecuencia")}</FieldTitle>
                    <NativeSelect
                      ariaLabel={t("Frecuencia")}
                      value={frequency}
                      disabled={saving}
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
                  {frequency === "interval" && (
                    <Field>
                      <FieldLabel htmlFor="medication-interval">{t("Horas entre tomas")}</FieldLabel>
                      <Input
                        id="medication-interval"
                        name="intervalHours"
                        type="number"
                        min={3}
                        max={168}
                        value={intervalHours}
                        onChange={(event) => setIntervalHours(event.target.value)}
                        required
                        disabled={saving}
                      />
                    </Field>
                  )}
                </FieldGroup>
                <div className="medication-form-presets" role="group" aria-label={t("Atajos de frecuencia")}>
                  {frequencyPresets.map((preset) => {
                    const active = preset.interval === null
                      ? frequency === "daily" && times.length === 1
                      : frequency === "interval" && intervalHours === String(preset.interval);
                    return (
                      <Button
                        key={preset.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={active}
                        onClick={() => applyFrequencyPreset(preset)}
                        disabled={saving}
                      >
                        {t(preset.label)}
                      </Button>
                    );
                  })}
                </div>
                {frequency === "weekly" && (
                  <fieldset className="medication-form-weekdays">
                    <legend>{t("Días de la semana")}</legend>
                    <div>
                      {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((label, index) => (
                        <label key={label}>
                          <input
                            type="checkbox"
                            name="weekday"
                            value={index}
                            disabled={saving}
                            defaultChecked={Boolean((treatment?.weekdayMask ?? 31) & (1 << index))}
                          />
                          {t(label)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="medication-form-times">
                  {times.map((time, index) => (
                    <div className="medication-time-input" key={index}>
                      <Input
                        type="time"
                        aria-label={t("Horario {number}", { number: String(index + 1) })}
                        value={time}
                        required
                        disabled={saving}
                        onChange={(event) =>
                          setTimes((current) =>
                            current.map((value, position) => position === index ? event.target.value : value),
                          )
                        }
                      />
                      {times.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("Eliminar horario {number}", { number: String(index + 1) })}
                          onClick={() => setTimes((current) => current.filter((_, position) => position !== index))}
                          disabled={saving}
                        >
                          <X aria-hidden />
                        </Button>
                      )}
                    </div>
                  ))}
                  {frequency !== "interval" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTimes((current) => [...current, "20:00"])}
                      disabled={saving || times.length >= 8}
                    >
                      <Plus data-icon="inline-start" aria-hidden />
                      {t("Añadir horario")}
                    </Button>
                  )}
                </div>
              </section>
            </div>

            <div className="medication-form-columns medication-form-details">
              <section className="medication-form-section" style={rainbowStyle("sky")} aria-labelledby="medication-dates-heading">
                <TreatmentSectionHeading id="medication-dates-heading" icon={CalendarDays} title={t("Vigencia")} />
                <FieldGroup className="medication-form-dates grid gap-4">
                  <Field>
                    <FieldLabel htmlFor="medication-start">{t("Fecha de inicio")}</FieldLabel>
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
                    <FieldLabel htmlFor="medication-end">{t("Fecha de fin (opcional)")}</FieldLabel>
                    <Input
                      id="medication-end"
                      name="endDate"
                      type="date"
                      defaultValue={treatment?.endDate ?? ""}
                      disabled={saving}
                    />
                  </Field>
                  <Field className="medication-form-zone">
                    <FieldLabel htmlFor="medication-zone">{t("Zona horaria")}</FieldLabel>
                    <Input
                      id="medication-zone"
                      name="timeZone"
                      defaultValue={treatment?.timeZone ?? zone}
                      required
                      disabled={saving}
                    />
                  </Field>
                </FieldGroup>
              </section>
              <section className="medication-form-section medication-form-notes" style={rainbowStyle("pink")} aria-labelledby="medication-instructions-heading">
                <TreatmentSectionHeading id="medication-instructions-heading" icon={FileText} title={t("Indicaciones")} />
                <Textarea
                  id="medication-instructions"
                  name="instructions"
                  aria-labelledby="medication-instructions-heading"
                  defaultValue={treatment?.instructions ?? ""}
                  maxLength={2000}
                  rows={3}
                  disabled={saving}
                />
              </section>
            </div>

            <details className="medication-form-reminders" style={rainbowStyle("green")}>
              <summary className="medication-form-section-heading">
                <span className="medication-form-section-icon spectrum-icon"><Bell aria-hidden /></span>
                {t("Recordatorios de medicación")}
                <ChevronDown className="medication-form-disclosure" aria-hidden />
              </summary>
              <FieldGroup className="medication-form-reminder-fields grid gap-4 sm:grid-cols-2">
                {([
                  ["push", "Notificaciones push"],
                  ["inApp", "Avisos en la app"],
                  ["whatsApp", "WhatsApp"],
                ] as const).map(([field, label]) => (
                  <Field key={field}>
                    <FieldLabel htmlFor={`medication-${field}`}>{t(label)}</FieldLabel>
                    <select
                      id={`medication-${field}`}
                      name={field}
                      className="h-10 rounded-lg border border-input bg-card px-2.5"
                      defaultValue={treatment?.reminders?.[field] == null ? "" : treatment.reminders[field] ? "yes" : "no"}
                      disabled={saving}
                    >
                      <option value="">{t("Preferencia del paciente")}</option>
                      <option value="yes">{t("Activado")}</option>
                      <option value="no">{t("Desactivado")}</option>
                    </select>
                  </Field>
                ))}
                <Field>
                  <FieldLabel htmlFor="medication-lead">{t("Anticipación (minutos)")}</FieldLabel>
                  <Input
                    id="medication-lead"
                    name="leadMinutes"
                    type="number"
                    min={0}
                    max={30}
                    defaultValue={treatment?.reminders?.leadMinutes ?? ""}
                    disabled={saving}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="medication-retry">{t("Segundo aviso (minutos)")}</FieldLabel>
                  <Input
                    id="medication-retry"
                    name="followUpMinutes"
                    type="number"
                    min={15}
                    max={90}
                    defaultValue={treatment?.reminders?.followUpMinutes ?? ""}
                    disabled={saving}
                  />
                </Field>
              </FieldGroup>
            </details>
          </DialogBody>

          <footer className="medication-form-actions" style={rainbowStyle("sky")}>
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={saving || (usesCatalog && !selectedDrug)}>
              <Save data-icon="inline-start" aria-hidden />
              {t(saving ? "Guardando..." : treatment ? "Guardar cambios" : "Guardar tratamiento")}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
