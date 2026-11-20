"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, HeartPulse, LoaderCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { validateUserForm } from "@/features/auth-common/utils/validation";
import { useT } from "@/providers/i18n-provider";
import { updateUser } from "../services/users-service";
import type { User } from "../types";
import { MobileAccessBadge, OpenPatientProfile, PatientAccessNotice } from "./user-visuals";

export function PatientAccountEditor({ user }: { user: User }) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState({ firstName: user.firstName ?? "", lastName: user.lastName ?? "", isActive: user.isActive });
  const [errors, setErrors] = useState({ firstName: "", lastName: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const accountHref = `/users/${user.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const { firstName, lastName } = validateUserForm({ ...form, email: user.email ?? "", password: "", isEditing: true });
    setErrors({ firstName, lastName });
    setError(null);
    if (firstName || lastName) {
      const field = event.currentTarget.elements.namedItem(firstName ? "firstName" : "lastName");
      if (field instanceof HTMLElement) field.focus();
      return;
    }

    setSaving(true);
    try {
      await updateUser(user.id, { firstName: form.firstName.trim(), lastName: form.lastName.trim(), isActive: form.isActive });
      router.push(accountHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo guardar la cuenta."));
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title={t("Editar cuenta de paciente")}
        description={t("Edita el nombre y el estado de acceso a la app móvil.")}
        icon={HeartPulse}
        actions={
          <Link href={accountHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft data-icon="inline-start" />
            {t("Volver")}
          </Link>
        }
      />
      <form onSubmit={submit} className="flex max-w-3xl flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-busy={saving}>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["firstName", "lastName"] as const).map((field) => (
            <div key={field} className="flex min-w-0 flex-col gap-2">
              <Label htmlFor={`patient-${field}`}>{field === "firstName" ? t("Nombre") : t("Apellido")}</Label>
              <Input
                id={`patient-${field}`}
                name={field}
                value={form[field]}
                disabled={saving}
                aria-required="true"
                aria-invalid={Boolean(errors[field])}
                aria-describedby={errors[field] ? `patient-${field}-error` : undefined}
                onChange={(event) => {
                  setForm({ ...form, [field]: event.target.value });
                  if (errors[field]) setErrors({ ...errors, [field]: "" });
                }}
              />
              {errors[field] && <p id={`patient-${field}-error`} className="text-sm text-destructive">{t(errors[field])}</p>}
            </div>
          ))}
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="patient-email">{t("Correo electrónico")}</Label>
            <Input id="patient-email" value={user.email || t("Sin correo")} readOnly />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="patient-phone">{t("Teléfono")}</Label>
            <Input id="patient-phone" value={user.phoneNumber || t("Sin teléfono")} readOnly />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="patient-active" checked={form.isActive} disabled={saving} onCheckedChange={(isActive) => setForm({ ...form, isActive })} />
          <Label htmlFor="patient-active">{t("Cuenta activa")}</Label>
        </div>
        <section className="flex flex-col gap-3 border-t border-border pt-4">
          <h2 className="font-semibold">{t("Acceso")}</h2>
          <MobileAccessBadge />
          <PatientAccessNotice />
          {user.patient && <OpenPatientProfile patient={user.patient} />}
        </section>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" type="button" disabled={saving} onClick={() => router.push(accountHref)}>{t("Cancelar")}</Button>
          <Button type="submit" className="bg-brand-gradient text-white" disabled={saving}>
            {saving && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
            {saving ? t("Guardando…") : t("Guardar cambios")}
          </Button>
        </div>
      </form>
    </div>
  );
}
