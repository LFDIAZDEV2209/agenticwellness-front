"use client";

import { CopyPlus } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "@/providers/i18n-provider";

/** 1.29 pendiente: no se inventa una ruta ni se modifica la versión activa. */
export function TemplateNewVersionAction({
  compact = false,
}: {
  compact?: boolean;
}) {
  const t = useT();
  const descriptionId = useId();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-describedby={descriptionId}
            className="inline-flex rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          />
        }
      >
        <Button
          disabled
          variant="outline"
          size={compact ? "icon" : "sm"}
          className={
            compact
              ? "pointer-events-none size-8"
              : "pointer-events-none min-h-11"
          }
          aria-label={t("Crear nueva versión")}
        >
          <CopyPlus aria-hidden className="size-4" />
          {!compact && t("Crear nueva versión")}
        </Button>
      </TooltipTrigger>
      <TooltipContent role="tooltip" id={descriptionId}>{t("Pendiente del backend")}</TooltipContent>
    </Tooltip>
  );
}
