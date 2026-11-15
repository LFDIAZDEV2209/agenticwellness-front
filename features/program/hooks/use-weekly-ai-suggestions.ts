"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useAppContext } from "@/providers/context-provider";
import { ApiError } from "@/lib/api/http";
import { applyWeeklyAi, requestWeeklyAi } from "../services/weekly-ai-suggestions-service";
import type { EnrollmentWeekResponse } from "../types";
import type { WeeklyAiResult } from "../types/weekly-ai-suggestions";

type Issue = "blocked" | "unavailable" | "insufficient" | "conflict" | "notAllowed" | "uncertain";
const denied = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);

export function useWeeklyAiSuggestions(enrollmentId: string, week: EnrollmentWeekResponse, language: "es" | "en", onBusyChange: (busy: boolean) => void) {
  const { user } = useAuth();
  const { can, loading, activeClinicId } = useAppContext();
  const enabled = !loading && !!user && can("Program.Profile360View") && can("Program.AiView");
  const canManage = enabled && can("Program.AiManage") && can("Program.Edit");
  const [revision, setRevision] = useState(0);
  // El DTO semanal no contiene planVersion: cualquier cambio manual vuelve a consultar stale en BACK.
  const key = `${user?.id}:${activeClinicId}:${enrollmentId}:${week.weekNumber}:${language}:${canManage}:${JSON.stringify(week)}:${revision}`;
  const [read, setRead] = useState<{ key: string; result?: WeeklyAiResult; issue?: Issue }>();
  const [operation, setOperation] = useState<{ key: string; running: boolean; issue?: Issue }>();
  const write = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    requestWeeklyAi(enrollmentId, week.weekNumber, language, controller.signal).then(
      result => { if (!controller.signal.aborted) setRead({ key, result }); },
      error => { if (!controller.signal.aborted) setRead({ key, issue: denied(error) ? "blocked" : "unavailable" }); },
    );
    return () => { controller.abort(); write.current?.abort(); write.current = null; onBusyChange(false); };
  }, [enabled, key, enrollmentId, week.weekNumber, language, onBusyChange]);
  const current = enabled && read?.key === key ? read : undefined;
  const active = enabled && operation?.key === key ? operation : undefined;
  const blocked = current?.issue === "blocked" || active?.issue === "blocked";
  const draft = !blocked && current?.result?.status === "ok" ? current.result.draft : null;
  async function mutate(index?: number) {
    if (!canManage || blocked || !current?.result || write.current || (index !== undefined && (!draft || draft.stale || active?.issue))) return null;
    const controller = new AbortController();
    write.current = controller;
    setOperation({ key, running: true });
    onBusyChange(true);
    try {
      if (index === undefined) {
        const result = await requestWeeklyAi(enrollmentId, week.weekNumber, language, controller.signal, true);
        if (controller.signal.aborted) return null;
        if (result.status === "ok") { setRead({ key, result }); setOperation({ key, running: false }); }
        else setOperation({ key, running: false, issue: result.status === "insufficient" ? "insufficient" : "unavailable" });
        return null;
      }
      const result = await applyWeeklyAi(enrollmentId, week.weekNumber, draft!.id, index, controller.signal);
      if (controller.signal.aborted) return null;
      setOperation({ key, running: false });
      setRevision(value => value + 1);
      return result;
    } catch (error) {
      if (!controller.signal.aborted) setOperation({ key, running: false, issue: denied(error) ? "blocked"
        : error instanceof ApiError && error.status === 409 ? "conflict"
        : error instanceof ApiError && error.status === 422 ? "notAllowed" : index === undefined ? "unavailable" : "uncertain" });
      return null;
    } finally {
      if (write.current === controller) { write.current = null; onBusyChange(false); }
    }
  }
  return { enabled, canManage, blocked, draft, loading: enabled && !current, readIssue: current?.issue,
    running: active?.running ?? false, issue: active?.issue, generate: () => mutate(), apply: (index: number) => mutate(index),
    refresh: () => setRevision(value => value + 1) };
}
