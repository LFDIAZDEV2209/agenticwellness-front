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

type PlanResult = { plan: MotorPlanDay } | { status: "missing" | "locked" | "error" };

export function MotorPlanDayCard({ patientId }: { patientId: string }) {
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
          if (!current.signal.aborted) setLoaded({ key, result: { plan } });
        },
        (error: unknown) => {
          if (current.signal.aborted) return;
          const status = error instanceof ApiError && (error.status === 403 || error.status === 404)
            ? "missing" : error instanceof ApiError && error.status === 409 ? "locked" : "error";
          setLoaded({ key, result: { status } });
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
  }, [key, patientId]);

  if (!key) return null;
  const result = loaded?.key === key ? loaded.result : undefined;
  if (result && "status" in result && result.status === "missing") return null;

  return (
    <section aria-labelledby={title}>
      <Card>
        <CardHeader>
          <CardTitle id={title}>{t("Motor 365")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!result ? <Skeleton className="h-5 w-40" aria-label={t("Consultando el plan…")} /> :
            "plan" in result ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-medium">{t("Día {day} de {total}", { day: String(result.plan.today), total: "365" })}</span>
                <Badge variant="outline">{t(STATE[result.plan.status.state])}</Badge>
                <span className="text-sm text-muted-foreground">{result.plan.measuredWeightKg === null
                  ? t("Sin pesaje")
                  : new Intl.NumberFormat(lang, { style: "unit", unit: "kilogram" }).format(result.plan.measuredWeightKg)}</span>
              </div>
            ) : <p className="text-sm text-muted-foreground">{t(result.status === "locked" ? "Plan bloqueado" : "Día del plan no disponible")}</p>}
        </CardContent>
      </Card>
    </section>
  );
}
