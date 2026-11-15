"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/http";
import { useAuth } from "@/providers/auth-provider";
import { useAppContext } from "@/providers/context-provider";
import { requestPatientSummary } from "../services/patient-ai-summary-service";
import type { PatientSummaryResult } from "../types/patient-ai-summary";

type Issue = "blocked" | "unavailable" | "insufficient";
const issueOf = (error: unknown): Issue => error instanceof ApiError && [401, 403, 404].includes(error.status) ? "blocked" : "unavailable";

/** Cada resultado queda ligado a paciente, idioma, sesión, clínica y consulta. Sin caché persistente. */
export function usePatientAiSummary(patientId: string, language: "es" | "en") {
  const { user } = useAuth();
  const { can, loading, activeClinicId } = useAppContext();
  const enabled = !loading && !!user && can("Program.Profile360View") && can("Program.AiView");
  const canGenerate = enabled && can("Program.AiManage");
  const [revision, setRevision] = useState(0);
  const key = `${user?.id}:${activeClinicId}:${patientId}:${language}:${canGenerate}:${revision}`;
  const [read, setRead] = useState<{ key: string; result?: PatientSummaryResult; issue?: Issue }>();
  const [generation, setGeneration] = useState<{ key: string; running: boolean; issue?: Issue }>();
  const post = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    requestPatientSummary(patientId, language, controller.signal).then(
      result => { if (!controller.signal.aborted) setRead({ key, result }); },
      error => { if (!controller.signal.aborted) setRead({ key, issue: issueOf(error) }); },
    );
    return () => { controller.abort(); post.current?.abort(); post.current = null; };
  }, [enabled, patientId, language, key]);

  const current = enabled && read?.key === key ? read : undefined;
  const operation = enabled && generation?.key === key ? generation : undefined;
  const blocked = current?.issue === "blocked" || operation?.issue === "blocked";
  async function generate() {
    if (!canGenerate || blocked || !current?.result || post.current) return;
    const controller = new AbortController();
    post.current = controller;
    setGeneration({ key, running: true });
    try {
      const result = await requestPatientSummary(patientId, language, controller.signal, true);
      if (controller.signal.aborted) return;
      if (result.status === "ok") {
        setRead({ key, result });
        setGeneration({ key, running: false });
      } else {
        // El fallo de un POST no rejuvenece ni borra un borrador anterior.
        setGeneration({ key, running: false, issue: result.status === "insufficient" ? "insufficient" : "unavailable" });
      }
    } catch (error) {
      if (!controller.signal.aborted) setGeneration({ key, running: false, issue: issueOf(error) });
    } finally { if (post.current === controller) post.current = null; }
  }
  return {
    enabled, canGenerate, blocked, loading: enabled && !current, readIssue: current?.issue,
    summary: !blocked && current?.result?.status === "ok" ? current.result.summary : null,
    generating: operation?.running ?? false, generationIssue: operation?.issue,
    generate, retry: () => setRevision(value => value + 1),
  };
}
