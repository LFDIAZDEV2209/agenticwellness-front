"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useAppContext } from "@/providers/context-provider";
import {
  checkPatientIdentityAvailability,
  type PatientIdentityAvailability,
  type PatientIdentityField,
  type PatientIdentityOwner,
} from "../services/patients-service";

function useIdentityCheck(field: PatientIdentityField, value: string) {
  const { user } = useAuth();
  const { activeClinicId } = useAppContext();
  const userId = user?.id;
  const key = JSON.stringify([userId, activeClinicId, field, value]);
  const [checked, setChecked] = useState<{ key: string; result: PatientIdentityAvailability }>();

  useEffect(() => {
    if (!userId || !value) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void checkPatientIdentityAvailability(field, value, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setChecked({ key, result });
        })
        .catch(() => {
          // El alta conserva su validación del servidor si falla la consulta anticipada.
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [field, key, userId, value]);

  return checked?.key === key && checked.result.exists ? checked.result : null;
}

export function usePatientIdentityAvailability(email: string, documentNumber: string, enabled: boolean) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedDocument = documentNumber.trim();
  return {
    emailMatch: useIdentityCheck(
      "email",
      enabled && normalizedEmail.length <= 320 && /^\S+@\S+\.\S+$/.test(normalizedEmail) ? normalizedEmail : "",
    ),
    documentMatch: useIdentityCheck(
      "documentNumber",
      enabled && normalizedDocument.length <= 50 ? normalizedDocument : "",
    ),
  };
}

export function patientIdentityHref(owner: PatientIdentityOwner | null | undefined) {
  if (!owner) return undefined;
  const directory = owner.kind === "user" ? "users" : "patients";
  return `/${directory}/${encodeURIComponent(owner.id)}`;
}
