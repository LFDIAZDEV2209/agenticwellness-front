"use client";

import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Pill,
  UserRoundSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useT } from "@/providers/i18n-provider";

/** Ilustración de la vista semanal; no representa registros de un paciente. */
export function MedicationTrackingEmpty({
  onChoose,
}: {
  onChoose: () => void;
}) {
  const t = useT();
  return (
    <Card
      className="medication-tracking-empty"
      aria-labelledby="tracking-empty-title"
    >
      <CardHeader className="medication-tracking-empty-copy">
        <span className="medication-tracking-empty-kicker">
          <UserRoundSearch aria-hidden />
          {t("Seguimiento por persona")}
        </span>
        <CardTitle>
          <h2 id="tracking-empty-title">
            {t("Elige a quién vas a acompañar")}
          </h2>
        </CardTitle>
        <CardDescription>
          {t("Consulta sus tomas, horarios y adherencia.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="medication-tracking-empty-art" aria-hidden="true">
        <div className="medication-calendar-sheet">
          <div className="medication-calendar-heading">
            <span>
              <CalendarDays />
              {t("Vista semanal")}
            </span>
            <i />
            <i />
            <i />
          </div>
          <div className="medication-calendar-days">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <div className="medication-calendar-body">
            {Array.from({ length: 21 }, (_, index) => (
              <span key={index} data-column={index % 7}>
                {index === 10 ? <Pill /> : <i />}
              </span>
            ))}
          </div>
          <div className="medication-calendar-caption">
            <span />
            <span />
          </div>
        </div>
        <span className="medication-calendar-accent" />
      </CardContent>
      <CardFooter className="medication-tracking-empty-footer">
        <Button onClick={onChoose}>
          <UserRoundSearch data-icon="inline-start" />
          {t("Elegir persona")}
          <ArrowUpRight data-icon="inline-end" />
        </Button>
        <div className="medication-tracking-empty-features">
          <span>
            <Clock3 aria-hidden />
            {t("Horarios")}
          </span>
          <span>
            <Pill aria-hidden />
            {t("Tomas")}
          </span>
          <span>
            <Activity aria-hidden />
            {t("Adherencia")}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}
