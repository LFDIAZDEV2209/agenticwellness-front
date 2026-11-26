"use client";

import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/http";
import { useAppContext } from "@/providers/context-provider";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/providers/i18n-provider";
import { readMotorPlanDay, type MotorPlanDay } from "../services/motor-plan-service";

const STATE = {
  active: "Plan activo",
  paused: "Plan en pausa",
  maint: "Plan en mantenimiento",
} as const;

type PlanResult = { plan: MotorPlanDay; syncedAt: string; stale?: boolean }
  | { status: "missing" | "locked" | "error" };

export function MotorPlanDayCard({ patientId, refresh }: { patientId: string; refresh: number }) {
  const { user } = useAuth();
  const { can, activeClinicId, context, loading } = useAppContext();
  const { t, lang } = useI18n();
  const title = useId();
  const allowed = !loading && user && can("Program.Profile360View");
  const key = allowed ? `${user.id}:${context?.organization?.id}:${activeClinicId}:${patientId}` : null;
  const [loaded, setLoaded] = useState<{ key: string; result: PlanResult }>();

  useEffect(() => {
    if (!key) return;
    let request: AbortController | undefined;
    const load = () => {
      request?.abort();
      const current = new AbortController();
      request = current;
      void readMotorPlanDay(patientId, current.signal).then(
        plan => {
          if (!current.signal.aborted) setLoaded({ key, result: { plan, syncedAt: new Date().toISOString() } });
        },
        (error: unknown) => {
          if (current.signal.aborted) return;
          const status = error instanceof ApiError && [401, 403, 404].includes(error.status)
            ? "missing" : error instanceof ApiError && error.status === 409 ? "locked" : "error";
          setLoaded(previous => status === "error" && previous?.key === key && "plan" in previous.result
            ? { key, result: { ...previous.result, stale: true } }
            : { key, result: { status } });
        },
      );
    };
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [key, patientId, refresh]);

  if (!key) return null;
  const result = loaded?.key === key ? loaded.result : undefined;
  if (result && "status" in result && result.status === "missing") return null;

  const targets = result && "plan" in result ? result.plan.nutrition : undefined;
  const number = new Intl.NumberFormat(lang === "en" ? "en-US" : "es-CO");

  return (
    <section aria-labelledby={title}>
      <Card>
        <CardHeader>
          <CardTitle id={title}>{t("Motor 365")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!result ? <Skeleton className="h-5 w-40" aria-label={t("Consultando el plan…")} /> :
            "plan" in result ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-medium">{t("Día {day} de {total}", { day: String(result.plan.today), total: "365" })}</span>
                  <time className="text-sm text-muted-foreground" dateTime={result.plan.todayLocalDate}>
                    {new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(result.plan.todayLocalDate))}
                  </time>
                  <Badge variant="outline">{t(STATE[result.plan.status.state])}</Badge>
                  <span className="text-sm text-muted-foreground">{result.plan.measuredWeightKg === null
                    ? t("Sin pesaje")
                    : new Intl.NumberFormat(lang, { style: "unit", unit: "kilogram" }).format(result.plan.measuredWeightKg)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <time dateTime={result.syncedAt}>
                    {t("Última sincronización: {time}", {
                      time: new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" }).format(new Date(result.syncedAt)),
                    })}
                  </time>
                  {result.plan.engine_ver && result.plan.params_version !== undefined && <span>
                    {t("Motor {engine} · Parámetros {params}", {
                      engine: result.plan.engine_ver, params: number.format(result.plan.params_version),
                    })}
                  </span>}
                </div>
                {result.stale && <p className="text-sm" role="status">{t("No se pudo actualizar el plan.")}</p>}
              </div>
            ) : <p className="text-sm text-muted-foreground">{t(result.status === "locked" ? "Plan bloqueado" : "Día del plan no disponible")}</p>}
          {targets && (
            <div className="mt-4 grid gap-1 border-t pt-3 text-sm">
              <p className="font-medium">{t("Meta diaria: {kcal} kcal", { kcal: number.format(targets.kcal) })}</p>
              <p>{t("{protein} g proteína · {carbs} g carbohidratos · {fat} g grasas", {
                protein: number.format(targets.proteinG),
                carbs: number.format(targets.carbsG),
                fat: number.format(targets.fatG),
              })}</p>
              <p>{t("Meta de fibra: {fiber} g", { fiber: number.format(targets.fiberG) })}</p>
              <p>{t("Meta de agua: {water} ml", { water: number.format(targets.waterMl) })}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
