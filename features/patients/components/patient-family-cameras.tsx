"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Camera, CameraOff, Eye, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";
import { rainbowStyle } from "@/lib/ui/rainbow";
import { useT } from "@/providers/i18n-provider";

type SharedCamera = { id: string; name: string; provider: string; ownerName: string };

function CameraPreview({ path }: { path: string }) {
  const t = useT();
  const [image, setImage] = useState("");
  const [failure, setFailure] = useState<"access" | "connection">();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let request: AbortController | undefined;
    let timer: number | undefined;
    const cancel = () => {
      window.clearTimeout(timer);
      request?.abort();
    };
    const refresh = async () => {
      const controller = new AbortController();
      request = controller;
      try {
        const frame = await apiFetch<{ image: string }>(path, { signal: controller.signal, cache: "no-store", timeoutMs: 5000 });
        if (controller.signal.aborted) return;
        setImage(`data:image/jpeg;base64,${frame.image}`);
        timer = window.setTimeout(() => void refresh(), 1200);
      } catch (error) {
        if (controller.signal.aborted) return;
        setImage("");
        setFailure(error instanceof ApiError && [401, 403, 404].includes(error.status) ? "access" : "connection");
      }
    };
    const onVisibility = () => {
      cancel();
      setImage("");
      if (!document.hidden) {
        setFailure(undefined);
        void refresh();
      }
    };
    if (!document.hidden) void refresh();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancel();
    };
  }, [path, attempt]);

  return (
    <div className="relative mt-4 grid aspect-video min-h-40 max-h-[min(48dvh,22rem)] w-full place-items-center overflow-hidden rounded-xl bg-slate-950 text-white">
      {image ? (
        <Image unoptimized src={image} alt={t("Imagen de la cámara")} fill className="object-contain" />
      ) : (
        <div role="status" className="grid justify-items-center gap-2 px-4 py-5 text-center text-sm">
          {failure
            ? <CameraOff className="size-6 text-slate-300" aria-hidden="true" />
            : <LoaderCircle className="size-6 text-sky-200 motion-safe:animate-spin" aria-hidden="true" />}
          <p>{failure === "access" ? t("El acceso a esta cámara ya no está disponible.")
            : failure === "connection" ? t("No pudimos conectar con la cámara.") : t("Conectando con la cámara…")}</p>
          {failure === "connection" && (
            <Button variant="secondary" size="sm" onClick={() => {
              setFailure(undefined);
              setAttempt((value) => value + 1);
            }}>{t("Reintentar")}</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function PatientFamilyCameras({ patientId }: { patientId: string }) {
  const t = useT();
  const path = `${env.apiUrl}/api/v1/family-cameras/patients/${encodeURIComponent(patientId)}`;
  const [cameras, setCameras] = useState<SharedCamera[]>();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [previewId, setPreviewId] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<SharedCamera[]>(path, { signal: controller.signal, cache: "no-store" })
      .then((value) => {
        if (!controller.signal.aborted) {
          setCameras(value);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCameras(undefined);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);

  function refresh() {
    setLoading(true);
    setRevision((value) => value + 1);
  }

  return (
    <section aria-labelledby="patient-camera-title" className="grid gap-4">
      <header style={rainbowStyle("teal")} className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-(--rainbow-border) bg-(--rainbow-soft) p-4 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-(--rainbow-border) bg-card text-(--rainbow-fg)">
            <Camera className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 id="patient-camera-title" className="text-xl font-semibold tracking-tight wrap-anywhere">{t("Cámaras compartidas")}</h2>
            <p className="flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("Acceso concedido por el paciente a los administradores del ERP.")}
            </p>
          </div>
        </div>
        <Button disabled={loading} onClick={refresh} variant="outline" size="sm">
          <RefreshCw data-icon="inline-start" className={loading ? "motion-safe:animate-spin" : ""} />
          {t("Actualizar cámaras")}
        </Button>
      </header>
      {loading && !cameras && <Skeleton className="h-36 rounded-2xl" />}
      {failed && !loading && (
        <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          {t("No pudimos cargar las cámaras de este paciente.")}
        </p>
      )}
      {cameras?.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card p-5">
          <CameraOff className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("Este paciente no ha compartido cámaras.")}</p>
        </div>
      )}
      {cameras?.map((camera) => (
        <article key={camera.id} aria-label={camera.name} className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold wrap-anywhere">{camera.name}</h3>
                {camera.provider === "demo" && (
                  <span style={rainbowStyle("amber")} className="rounded-full border border-(--rainbow-border) bg-(--rainbow-soft) px-2.5 py-0.5 text-xs font-semibold text-(--rainbow-fg)">
                    {t("Simulación")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground wrap-anywhere">{camera.ownerName}</p>
            </div>
            <Button variant="outline" size="sm" aria-expanded={previewId === camera.id}
              onClick={() => setPreviewId((current) => current === camera.id ? undefined : camera.id)}>
              <Eye data-icon="inline-start" />
              {previewId === camera.id ? t("Cerrar cámara") : t("Ver cámara")}
            </Button>
          </div>
          {previewId === camera.id && <CameraPreview key={camera.id} path={`${path}/${camera.id}/frame`} />}
        </article>
      ))}
    </section>
  );
}
