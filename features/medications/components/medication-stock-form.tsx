"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useT } from "@/providers/i18n-provider";
import { saveMedicationStock } from "../services";
import { medicationErrorKey } from "../hooks";
import type { MedicationSupply, StockRequest } from "../monitoring-types";
import { MedicationError } from "./medication-shared";
export function MedicationStockForm({
  supply,
  onSaved,
  onCancel,
}: {
  supply: MedicationSupply;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<StockRequest["kind"]>(
      supply.tracked ? "refill" : "initial",
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const operation = useRef<{ signature: string; id: string } | null>(null);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const data = new FormData(e.currentTarget);
    const body = {
      kind,
      quantity: Number(data.get("quantity")),
      expectedRevision: supply.revision,
      expiresOn: String(data.get("expiresOn") || "") || null,
      reason: String(data.get("reason") || "") || null,
    };
    const signature = JSON.stringify(body);
    if (operation.current?.signature !== signature)
      operation.current = { signature, id: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      await saveMedicationStock(supply.patientId, supply.treatmentId, {
        ...body,
        clientRequestId: operation.current!.id,
      });
      onSaved();
    } catch (issue) {
      setError(t(medicationErrorKey(issue)));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="medication-monitoring-form" onSubmit={save}>
      <h3>{supply.name}</h3>
      {error && <MedicationError message={error} />}
      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t("Movimiento")}</FieldLabel>
          <NativeSelect
            ariaLabel={t("Movimiento")}
            value={kind}
            onChange={(v) => setKind(v as StockRequest["kind"])}
            disabled={saving}
            options={
              supply.tracked
                ? [
                    { value: "refill", label: t("Reposición") },
                    { value: "adjustment", label: t("Ajuste de inventario") },
                  ]
                : [{ value: "initial", label: t("Conteo inicial") }]
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="stock-quantity">
            {t(kind === "adjustment" ? "Existencias actuales" : "Cantidad")} ·{" "}
            {supply.unit}
          </FieldLabel>
          <Input
            id="stock-quantity"
            name="quantity"
            aria-label={t("Cantidad")}
            type="number"
            min="0"
            max="1000000"
            step="0.0001"
            required
            disabled={saving}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="stock-expiry">
            {t("Vencimiento (opcional)")}
          </FieldLabel>
          <Input
            id="stock-expiry"
            name="expiresOn"
            type="date"
            disabled={saving}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="stock-reason">{t("Motivo")}</FieldLabel>
          <Textarea
            id="stock-reason"
            name="reason"
            required={kind === "adjustment"}
            maxLength={500}
            rows={2}
            disabled={saving}
          />
        </Field>
      </FieldGroup>
      <div className="medication-inline-actions">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          {t("Cancelar")}
        </Button>
        <Button type="submit" disabled={saving}>
          {t(saving ? "Guardando..." : "Guardar inventario")}
        </Button>
      </div>
    </form>
  );
}
