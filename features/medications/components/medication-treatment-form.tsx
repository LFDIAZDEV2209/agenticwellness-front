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
  searchUsMedicationCatalog,
  type RxTermsOption,
} from "../services";
import type { MedicationProductType } from "../types";
import { MedicationError } from "./medication-shared";

const rxTermsLabel = (item: RxTermsOption) => item.name;

export function MedicationTreatmentForm({
  patientId,
  onSaved,
  onCancel,
}: {
  patientId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const capabilities = useMedicationCapabilities();
  const [productType, setProductType] =
    useState<MedicationProductType>("medication");
  const [selectedDrug, setSelectedDrug] = useState<RxTermsOption | null>(null);
  const [times, setTimes] = useState(["08:00"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const zone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
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
      await createMedicationTreatment(patientId, {
        ...body,
        clientRequestId: operation.current!.id,
      });
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
          <h2 id="medication-form-title">{t("Nuevo tratamiento")}</h2>
          <p>{t(productType === "supplement" ? "Nutracéutico adicional" : "Se asignará al plan obligatorio del paciente.")}</p>
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
            defaultValue={selectedDrug ? "" : "1"}
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
            defaultValue={selectedDrug ? "" : "tableta"}
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
            defaultValue={selectedDrug ? "" : "oral"}
            required={selectedDrug !== null}
            disabled={saving}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="medication-zone">{t("Zona horaria")}</FieldLabel>
          <Input
            id="medication-zone"
            name="timeZone"
            defaultValue={zone}
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
            defaultValue={new Date().toLocaleDateString("en-CA")}
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
            type="date"
            disabled={saving}
          />
        </Field>
      </FieldGroup>
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
            disabled={saving || times.length >= 8}
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
          maxLength={2000}
          rows={3}
          disabled={saving}
        />
      </Field>
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
          {t(saving ? "Guardando..." : "Guardar tratamiento")}
        </Button>
      </div>
    </form>
  );
}
