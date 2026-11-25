"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  HeartPulse,
  IdCard,
  LoaderCircle,
  Mail,
  Phone,
} from "lucide-react";
import { useBreadcrumbTitle } from "@/components/layout/breadcrumb-provider";
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
import {
  MobileAccessBadge,
  OpenPatientProfile,
  PatientAccessNotice,
  UserAvatar,
} from "./user-visuals";

export function PatientAccountEditor({ user }: { user: User }) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    isActive: user.isActive,
  });
  const [errors, setErrors] = useState({ firstName: "", lastName: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const accountHref = `/users/${user.id}`;
  useBreadcrumbTitle(t("Editar cuenta"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const { firstName, lastName } = validateUserForm({
      ...form,
      email: user.email ?? "",
      password: "",
      isEditing: true,
    });
    setErrors({ firstName, lastName });
    setError(null);
    if (firstName || lastName) {
      const field = event.currentTarget.elements.namedItem(
        firstName ? "firstName" : "lastName",
      );
      if (field instanceof HTMLElement) field.focus();
      return;
    }

    setSaving(true);
    try {
      await updateUser(user.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        isActive: form.isActive,
      });
      router.push(accountHref);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("No se pudo guardar la cuenta."),
      );
      setSaving(false);
    }
  }

  // Datos gestionados por el paciente desde la app: se muestran como texto, no como inputs.
  const readOnlyData = [
    {
      key: "email",
      label: t("Correo electrónico"),
      value: user.email,
      empty: t("Sin correo"),
      icon: Mail,
    },
    {
      key: "phone",
      label: t("Teléfono"),
      value: user.phoneNumber,
      empty: t("Sin teléfono"),
      icon: Phone,
    },
    {
      key: "document",
      label: t("Documento"),
      value: user.patient?.documentNumber,
      empty: user.patient ? t("Sin documento") : t("Sin ficha vinculada"),
      icon: IdCard,
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title={t("Editar cuenta de paciente")}
        description={t("Edita el nombre y el estado de acceso a la app móvil.")}
        icon={HeartPulse}
        actions={
          <Link
            href={accountHref}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft data-icon="inline-start" />
            {t("Volver")}
          </Link>
        }
      />
      <form
        onSubmit={submit}
        noValidate
        aria-busy={saving}
        aria-labelledby="patient-account-title"
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-brand-blue-soft/40 bg-card shadow-xs"
      >
        {/* Cabecera de la tarjeta: identidad + canal */}
        <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-4">
          <UserAvatar
            user={form}
            className="size-10 ring-2 ring-brand-teal/60"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2
              id="patient-account-title"
              className="text-sm font-semibold text-foreground"
            >
              {t("Cuenta de persona")}
            </h2>
            <MobileAccessBadge />
          </div>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <fieldset className="grid gap-4 sm:grid-cols-2" disabled={saving}>
            <legend className="sr-only">{t("Identidad")}</legend>
            {(["firstName", "lastName"] as const).map((field) => (
              <div key={field} className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`patient-${field}`}>
                  {field === "firstName" ? t("Nombre") : t("Apellido")}
                </Label>
                <Input
                  id={`patient-${field}`}
                  name={field}
                  value={form[field]}
                  autoComplete={
                    field === "firstName" ? "given-name" : "family-name"
                  }
                  className="h-11 sm:h-9"
                  aria-required="true"
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={
                    errors[field] ? `patient-${field}-error` : undefined
                  }
                  onChange={(event) => {
                    setForm({ ...form, [field]: event.target.value });
                    if (errors[field]) setErrors({ ...errors, [field]: "" });
                  }}
                />
                {errors[field] && (
                  <p
                    id={`patient-${field}-error`}
                    className="text-[13px] text-destructive"
                  >
                    {t(errors[field])}
                  </p>
                )}
              </div>
            ))}
          </fieldset>

          <section
            aria-labelledby="patient-readonly-title"
            className="flex flex-col gap-2.5 rounded-xl bg-muted/40 p-4"
          >
            <h3
              id="patient-readonly-title"
              className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              {t("Datos de la app")}
            </h3>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {readOnlyData.map(({ key, label, value, empty, icon: Icon }) => (
                <div key={key} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                    <Icon aria-hidden="true" className="size-3" />
                    {label}
                  </dt>
                  <dd
                    className={
                      value
                        ? "truncate font-mono text-[13px] text-foreground"
                        : "text-[13px] text-muted-foreground italic"
                    }
                  >
                    {value || empty}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-[12px] text-muted-foreground">
              {t(
                "El correo y el teléfono los gestiona la persona desde la app.",
              )}
            </p>
          </section>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label htmlFor="patient-active">{t("Cuenta activa")}</Label>
              <p
                id="patient-active-hint"
                className="text-[12px] text-muted-foreground"
              >
                {form.isActive
                  ? t("La persona puede entrar a la app móvil.")
                  : t("El paciente no podrá entrar a la app móvil.")}
              </p>
            </div>
            <Switch
              id="patient-active"
              checked={form.isActive}
              disabled={saving}
              aria-describedby="patient-active-hint"
              onCheckedChange={(isActive) => setForm({ ...form, isActive })}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <PatientAccessNotice className="flex-1" />
            {user.patient && <OpenPatientProfile patient={user.patient} />}
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            type="button"
            disabled={saving}
            onClick={() => router.push(accountHref)}
          >
            {t("Cancelar")}
          </Button>
          <Button
            type="submit"
            className="bg-brand-gradient text-white"
            disabled={saving}
          >
            {saving && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            )}
            {saving ? t("Guardando…") : t("Guardar cambios")}
          </Button>
        </div>
      </form>
    </div>
  );
}
