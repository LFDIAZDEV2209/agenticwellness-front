"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useT } from "@/providers/i18n-provider";
import { useAppContext } from "@/providers/context-provider";
import { useNutritionResource } from "../hooks/use-nutrition-resource";
import { useNutritionEditor } from "../hooks/use-nutrition-editor";
import {
  fetchNutritionWorkspace,
  performNutritionAction,
  saveNutritionDraft,
} from "../services/nutrition-service";
import type {
  NutritionAlert,
  NutritionFood,
  NutritionPatientDetail,
} from "../types/nutrition";
import { NutritionPlanEditor } from "./nutrition-plan-editor";
import { NutritionStateChip, NutritionTargetsPanel } from "./nutrition-shared";

export interface ClosingNextPlan {
  id: string;
  revision: number;
  alerts: NutritionAlert[];
  patient: NutritionPatientDetail;
}
export function NutritionNextCyclePlan({
  patientId,
  sourceId,
  cycleId,
  disabled,
  onReady,
  onBusy,
}: {
  patientId: string;
  sourceId: string;
  cycleId: string;
  disabled: boolean;
  onReady: (plan: ClosingNextPlan | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = useT();
  const { can } = useAppContext();
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchNutritionWorkspace(patientId, signal, sourceId),
    [patientId, sourceId],
  );
  const resource = useNutritionResource(load);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [modalLocked, setModalLocked] = useState(false);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  useEffect(() => {
    onBusy(creating || !!editing);
    return () => onBusy(false);
  }, [creating, editing, onBusy]);
  const headers = (resource.data?.patient?.cycleHeaders ?? []).filter(
    (row) =>
      row.cycleId !== cycleId &&
      !row.isPublished &&
      ["borrador_ia", "devuelto", "en_aprobacion"].includes(row.state),
  );
  const refresh = () => {
    onReady(null);
    setFailed(false);
    resource.retry();
  };
  async function create() {
    if (
      disabled ||
      running.current ||
      !can("Nutrition.Manage") ||
      !resource.data?.patient?.cycle
    )
      return;
    const controller = new AbortController();
    running.current = controller;
    setCreating(true);
    onBusy(true);
    setFailed(false);
    onReady(null);
    let created: NutritionPatientDetail | null = null;
    try {
      const { patient, catalog } = resource.data;
      const source = patient!.cycle!;
      created = await performNutritionAction(
        patient!,
        "create",
        patient!.revision,
        catalog,
        {},
        controller.signal,
        false,
      );
      if (
        created.cycle?.id === source.id ||
        created.cycleHeaders?.find((h) => h.id === created!.cycle!.id)
          ?.cycleId === cycleId
      )
        throw Error("next-cycle-identity");
      const copy = {
        ...created.cycle!,
        targets: structuredClone(source.targets),
        meals: structuredClone(source.meals),
        instructions: source.instructions,
      };
      await saveNutritionDraft(
        created,
        copy,
        created.cycle!,
        created.revision,
        catalog,
        controller.signal,
        false,
      );
      if (!controller.signal.aborted) {
        resource.retry();
        setEditing(created.cycle!.id);
      }
    } catch {
      if (!controller.signal.aborted) {
        setFailed(true);
        if (created?.cycle) {
          resource.retry();
          setEditing(created.cycle.id);
        }
      }
    } finally {
      running.current = null;
      if (!controller.signal.aborted) {
        setCreating(false);
        onBusy(false);
      }
    }
  }
  return (
    <div className="nutrition-closing-plan">
      <p>
        {t(
          "El plan siguiente se edita como borrador. Se aprobará junto con el mensaje en el paso 7.",
        )}
      </p>
      {resource.loading ? (
        <p role="status">{t("Cargando planes del paciente…")}</p>
      ) : resource.error ? (
        <div role="alert">
          <p>{t("No pudimos cargar los planes del paciente.")}</p>
          <Button variant="outline" onClick={refresh}>
            {t("Reintentar planes")}
          </Button>
        </div>
      ) : (
        <>
          <label className="nutrition-closing-field">
            <span>{t("Borrador del siguiente ciclo")}</span>
            <select
              value={editing ?? ""}
              disabled={disabled || creating}
              onChange={(e) => {
                if (e.target.value) {
                  onReady(null);
                  setEditing(e.target.value);
                  onBusy(true);
                }
              }}
            >
              <option value="">
                {t("Seleccionar un borrador para revisar")}
              </option>
              {headers.map((h, i) => (
                <option key={h.id} value={h.id}>
                  {t("Borrador {number} · versión {version}", {
                    number: String(i + 1),
                    version: String(h.version),
                  })}{" "}
                  ·{" "}
                  {t(
                    h.state === "en_aprobacion"
                      ? "Por publicar"
                      : h.state === "devuelto"
                        ? "Devuelto"
                        : "Borrador",
                  )}
                </option>
              ))}
            </select>
          </label>
          {!headers.length && (
            <p className="nutrition-review-notice">
              {t(
                "No hay un borrador del siguiente ciclo. Crea uno antes de publicar el cierre.",
              )}
            </p>
          )}
          <div className="nutrition-closing-actions">
            <Button
              variant="outline"
              disabled={
                disabled || creating || failed || !can("Nutrition.Manage")
              }
              onClick={() => void create()}
            >
              {t(
                creating
                  ? "Preparando siguiente plan…"
                  : "Crear siguiente plan con el anterior como base",
              )}
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || creating}
              onClick={refresh}
            >
              {t("Actualizar planes")}
            </Button>
          </div>
        </>
      )}
      {failed && (
        <p role="alert">
          {t(
            "No se completó la preparación. Actualiza los planes para comprobar si se creó el borrador antes de intentarlo otra vez.",
          )}
        </p>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !creating && !modalLocked) {
            setEditing(null);
            onBusy(false);
          }
        }}
      >
        <DialogContent
          size="xl"
          showCloseButton={false}
          className="nutrition-module nutrition-rework nutrition-closing-editor"
        >
          <DialogHeader>
            <DialogTitle>{t("Preparar el siguiente plan")}</DialogTitle>
            <DialogDescription>
              {t(
                "Revisa metas y comidas. Enviar a aprobación lo deja listo; esta pantalla no lo publica por separado.",
              )}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <NextPlanLoad
              key={editing}
              patientId={patientId}
              id={editing}
              onLock={setModalLocked}
              onReady={(plan) => {
                onReady(plan);
                setEditing(null);
                onBusy(false);
              }}
              onClose={() => {
                setEditing(null);
                onBusy(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function NextPlanLoad({
  patientId,
  id,
  onReady,
  onClose,
  onLock,
}: {
  patientId: string;
  id: string;
  onReady: (p: ClosingNextPlan) => void;
  onClose: () => void;
  onLock: (locked: boolean) => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => fetchNutritionWorkspace(patientId, signal, id),
    [patientId, id],
  );
  const resource = useNutritionResource(load);
  if (resource.loading)
    return <p role="status">{t("Cargando editor del siguiente plan…")}</p>;
  if (resource.error || !resource.data?.patient?.cycle)
    return (
      <div role="alert">
        <p>
          {t(
            "No pudimos cargar el borrador. No se publicará con datos incompletos.",
          )}
        </p>
        <Button variant="outline" onClick={resource.retry}>
          {t("Reintentar")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("Volver al cierre")}
        </Button>
      </div>
    );
  return (
    <NextPlanEditor
      initial={resource.data.patient}
      catalog={resource.data.catalog}
      onReady={onReady}
      onClose={onClose}
      onLock={onLock}
      onReload={resource.retry}
    />
  );
}
function NextPlanEditor({
  initial,
  catalog,
  onReady,
  onClose,
  onLock,
  onReload,
}: {
  initial: NutritionPatientDetail;
  catalog: NutritionFood[];
  onReady: (p: ClosingNextPlan) => void;
  onClose: () => void;
  onLock: (locked: boolean) => void;
  onReload: () => void;
}) {
  const t = useT();
  const { can } = useAppContext();
  const editor = useNutritionEditor(
    initial,
    catalog,
    can("Nutrition.Manage"),
    false,
    false,
  );
  const cycle = editor.patient.cycle!;
  const locked =
    editor.busy || editor.saveStatus !== "saved" || editor.reloadRequired;
  useEffect(() => {
    onLock(locked);
    return () => onLock(false);
  }, [locked, onLock]);
  return (
    <>
      <div className="nutrition-closing-actions">
        <NutritionStateChip state={cycle.state} />
        <span role="status">
          {t(
            editor.saveStatus === "saving"
              ? "Guardando cambios…"
              : editor.saveStatus === "error"
                ? "No se guardaron los cambios"
                : "Cambios guardados",
          )}
        </span>
        <Button variant="outline" disabled={locked} onClick={onClose}>
          {t("Volver al cierre")}
        </Button>
      </div>
      <div className="nutrition-closing-editor-scroll">
        <NutritionPlanEditor
          cycle={cycle}
          catalog={catalog}
          editable={editor.editable}
          update={editor.updateCycle}
          regenerate={() => void editor.act("regenerate")}
          applyDay={async (sourceDay) =>
            !!(await editor.act("apply-day", { sourceDay }))
          }
        />
      </div>
      {(editor.saveError || editor.actionError) && (
        <div role="alert">
          <p>
            {t(
              "No se pudo guardar el plan. Conserva los cambios y comprueba el estado antes de continuar.",
            )}
          </p>
          {!editor.reloadRequired && (
            <Button variant="outline" onClick={editor.retrySave}>
              {t("Reintentar guardado")}
            </Button>
          )}
          {editor.reloadRequired && (
            <>
              <p>
                {t(
                  "Recargar el borrador descarta los cambios locales sin confirmar.",
                )}
              </p>
              <Button variant="outline" onClick={onReload}>
                {t("Comprobar estado del plan")}
              </Button>
            </>
          )}
        </div>
      )}
      <div className="nutrition-closing-actions">
        {["borrador_ia", "devuelto"].includes(cycle.state) && (
          <Button
            disabled={locked || !can("Nutrition.Manage")}
            onClick={() => void editor.act("submit")}
          >
            {t("Enviar plan a aprobación")}
          </Button>
        )}
        <Button
          disabled={locked || cycle.state !== "en_aprobacion"}
          onClick={() =>
            onReady({
              id: cycle.id,
              revision: editor.patient.revision,
              alerts: cycle.alerts,
              patient: editor.patient,
            })
          }
        >
          {t("Usar este plan en el cierre")}
        </Button>
      </div>
      <NutritionTargetsPanel targets={cycle.targets} />
    </>
  );
}
