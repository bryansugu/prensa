/**
 * Estado de la herramienta "Comprimir": archivos, análisis, ajustes y
 * resultados. Orquesta el motor (workers) a través del pool.
 */
import { Comlink, progressProxy } from "@prensa/engine/client";
import {
  CompressionSpec,
  defaultSpec,
  formatBytes,
  outputFileName,
  type AnalysisReport,
  type CloudConfig,
  type CompressionResult,
  type JobState,
  type PresetId,
  type ProgressEvent,
} from "@prensa/schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { estimateLocalMemoryNeed, isFatalEngineError, isMemoryError, memoryProfile } from "@/lib/memory";
import { cancelCloudJob, createCloudJob, deleteCloudJob, fetchCloudConfig, uploadToCloud, watchCloudJob } from "./cloud";
import { pool } from "./engine-pool";
import { useHistoryStore } from "./history";

export type FileStatus = "opening" | "analyzing" | "ready" | "compressing" | "uploading" | "cloud" | "done" | "error" | "password";

export interface FileEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  slot: number;
  status: FileStatus;
  pageCount: number | null;
  report: AnalysisReport | null;
  thumbnailUrl: string | null;
  progress: ProgressEvent | null;
  result: CompressionResult | null;
  outputUrl: string | null;
  outputName: string | null;
  error: string | null;
  /** true si la última compresión se canceló */
  cancelled: boolean;
  /** Estado del trabajo en la nube (si el archivo se procesó allí) */
  cloud: JobState | null;
  /** El usuario pidió procesar este archivo en la nube (p. ej. por tamaño) */
  forceCloud: boolean;
  /** Demasiado grande para analizar/comprimir en el navegador */
  tooLargeForLocal: boolean;
  /** El archivo pasó a la nube automáticamente porque el navegador se quedó sin memoria */
  rescued: "memory" | null;
}

interface CompressState {
  files: FileEntry[];
  spec: CompressionSpec;
  addFiles: (files: Iterable<File>) => void;
  removeFile: (id: string) => void;
  clear: () => void;
  setSpec: (update: (spec: CompressionSpec) => CompressionSpec) => void;
  setPreset: (preset: PresetId) => void;
  resetSpec: () => void;
  compressAll: () => Promise<void>;
  compressOne: (id: string) => Promise<void>;
  cancel: (id: string) => void;
  cancelAll: () => void;
  unlock: (id: string, password: string) => Promise<void>;
  /** Avisar con una notificación del sistema cuando termine y la pestaña esté oculta */
  notify: boolean;
  setNotify: (on: boolean) => void;
  /** Código de acceso a la nube (si el servidor lo exige) */
  cloudAccessCode: string;
  setCloudAccessCode: (code: string) => void;
  processInCloud: (id: string) => Promise<void>;
  deleteFromCloud: (id: string) => Promise<void>;
  setForceCloud: (id: string, on: boolean) => void;
  /** Si el navegador se queda sin memoria, continuar en la nube sin preguntar */
  autoRescue: boolean;
  setAutoRescue: (on: boolean) => void;
  /** Configuración pública de la nube (se carga una vez; null si no está disponible) */
  cloudConfig: CloudConfig | null;
}

const watchers = new Map<string, () => void>();
const uploadAborts = new Map<string, AbortController>();

const MAX_FILES = 50;
/** Memoria detectada en este navegador; fija los límites de tamaño para procesar en local. */
export const MEMORY = memoryProfile();
/** Por encima de esto el navegador se queda sin memoria WASM: solo nube (depende de la RAM del equipo, máx. 400 MB). */
export const LOCAL_HARD_LIMIT = MEMORY.hardLimit;
/** Por encima de esto recomendamos la nube (funciona en local, pero lento y con riesgo de memoria). */
export const LOCAL_SOFT_LIMIT = MEMORY.softLimit;

let cloudConfigPromise: Promise<void> | null = null;
/** Carga la configuración de la nube una sola vez (para saber si el rescate automático es posible). */
function ensureCloudConfig(): Promise<void> {
  if (!cloudConfigPromise) {
    cloudConfigPromise = fetchCloudConfig()
      .then((c): void => {
        useCompressStore.setState({ cloudConfig: c });
      })
      .catch((): void => undefined);
  }
  return cloudConfigPromise;
}

/** ¿Podemos mandar este archivo a la nube sin preguntar nada más? */
function cloudAvailableFor(size: number): boolean {
  const { cloudConfig, cloudAccessCode } = useCompressStore.getState();
  if (!cloudConfig?.enabled) return false;
  if (size > cloudConfig.maxBytes) return false;
  return !cloudConfig.requiresAccessCode || cloudAccessCode.length > 0;
}

function largestImagePixels(report: AnalysisReport | null): number {
  let max = 0;
  for (const img of report?.images ?? []) max = Math.max(max, img.width * img.height);
  return max;
}

/**
 * El módulo WASM del slot quedó inutilizable: se recrea el worker y se
 * vuelven a abrir los demás archivos que vivían en él.
 */
function recoverSlot(slot: number, exceptId: string): void {
  pool.reset(slot);
  for (const f of useCompressStore.getState().files) {
    if (f.slot !== slot || f.id === exceptId || f.tooLargeForLocal) continue;
    if (f.status === "ready" || f.status === "done" || f.status === "error") {
      patch(f.id, { status: "opening" });
      void openAndAnalyze(f.id, useCompressStore.getState().spec.password);
    }
  }
}

/** Solo en desarrollo: `?simular-oom` hace que la compresión local falle por memoria (para probar el rescate). */
function simulatedOom(): boolean {
  return import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("simular-oom");
}

function patch(id: string, update: Partial<FileEntry>) {
  useCompressStore.setState((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, ...update } : f)) }));
}

function getEntry(id: string): FileEntry | undefined {
  return useCompressStore.getState().files.find((f) => f.id === id);
}

function revoke(entry: FileEntry) {
  if (entry.thumbnailUrl) URL.revokeObjectURL(entry.thumbnailUrl);
  if (entry.outputUrl) URL.revokeObjectURL(entry.outputUrl);
}

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("PASSWORD_REQUIRED")) return "PASSWORD_REQUIRED";
  if (raw.includes("CANCELLED")) return "CANCELLED";
  if (/not a PDF|no objects found|cannot find startxref|unknown format/i.test(raw)) return "El archivo no es un PDF válido o está dañado.";
  if (/memory|allocation|out of memory|RangeError/i.test(raw)) return "No hay memoria suficiente en el navegador para este archivo. Prueba con un archivo más pequeño.";
  return raw || "Error desconocido";
}

async function openAndAnalyze(id: string, password?: string): Promise<void> {
  const entry = getEntry(id);
  if (!entry) return;
  if (entry.size > LOCAL_HARD_LIMIT) {
    // No se abre en el navegador: quedaría sin memoria. Solo se puede procesar en la nube.
    patch(id, { status: "ready", tooLargeForLocal: true });
    return;
  }
  try {
    const buffer = await entry.file.arrayBuffer();
    await pool.run(entry.slot, async (api) => {
      const bytes = new Uint8Array(buffer);
      const { pageCount } = await api.open(id, Comlink.transfer(bytes, [bytes.buffer]), entry.name, password);
      if (!getEntry(id)) return; // eliminado mientras abría
      patch(id, { status: "analyzing", pageCount });
      const report = await api.analyze(id);
      let thumbnailUrl: string | null = null;
      try {
        const thumb = await api.renderPage(id, 0, 0.4);
        thumbnailUrl = URL.createObjectURL(new Blob([thumb.png as BlobPart], { type: "image/png" }));
      } catch {
        /* sin miniatura */
      }
      if (!getEntry(id)) {
        if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
        return;
      }
      patch(id, { status: "ready", report, thumbnailUrl });
    });
  } catch (err) {
    const message = errorMessage(err);
    if (message === "PASSWORD_REQUIRED") patch(id, { status: "password", error: password ? "Contraseña incorrecta." : null });
    else if (isMemoryError(err)) {
      // No cabe ni para analizarlo: queda como "solo nube" (y el rescate lo manda solo si está activo).
      if (isFatalEngineError(err)) recoverSlot(entry.slot, id);
      patch(id, { status: "ready", tooLargeForLocal: true, error: null });
    } else patch(id, { status: "error", error: message });
  }
}

export const useCompressStore = create<CompressState>()(
  persist(
    (set, get) => ({
      files: [],
      spec: defaultSpec(),

      addFiles: (incoming) => {
        const current = get().files;
        const room = Math.max(0, MAX_FILES - current.length);
        const list = [...incoming]
          .filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf")
          .slice(0, room);
        if (list.length === 0) return;
        const entries: FileEntry[] = list.map((file) => ({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          size: file.size,
          slot: pool.assign(),
          status: "opening",
          pageCount: null,
          report: null,
          thumbnailUrl: null,
          progress: null,
          result: null,
          outputUrl: null,
          outputName: null,
          error: null,
          cancelled: false,
          cloud: null,
          forceCloud: false,
          tooLargeForLocal: false,
          rescued: null,
        }));
        set({ files: [...current, ...entries] });
        void ensureCloudConfig();
        for (const e of entries) void openAndAnalyze(e.id);
      },

      removeFile: (id) => {
        const entry = getEntry(id);
        if (!entry) return;
        watchers.get(id)?.();
        watchers.delete(id);
        uploadAborts.get(id)?.abort();
        uploadAborts.delete(id);
        revoke(entry);
        pool.release(entry.slot);
        void pool.run(entry.slot, async (api) => api.close(id)).catch(() => undefined);
        set((s) => ({ files: s.files.filter((f) => f.id !== id) }));
      },

      clear: () => {
        for (const f of get().files) {
          watchers.get(f.id)?.();
          uploadAborts.get(f.id)?.abort();
          revoke(f);
          pool.release(f.slot);
          void pool.run(f.slot, async (api) => api.close(f.id)).catch(() => undefined);
        }
        set({ files: [] });
      },

      setSpec: (update) => set((s) => ({ spec: CompressionSpec.parse(update(s.spec)) })),
      setPreset: (preset) => set((s) => ({ spec: { ...s.spec, preset } })),
      resetSpec: () => set({ spec: defaultSpec() }),

      compressOne: async (id) => {
        const entry = getEntry(id);
        if (!entry || (entry.status !== "ready" && entry.status !== "done" && entry.status !== "error")) return;
        const spec = get().spec;
        if (spec.cloud.enabled || entry.forceCloud) return get().processInCloud(id);
        await ensureCloudConfig();
        const canRescue = get().autoRescue && cloudAvailableFor(entry.size);
        const rescue = () => {
          patch(id, { rescued: "memory", tooLargeForLocal: true, progress: null });
          return get().processInCloud(id);
        };
        if (entry.tooLargeForLocal) {
          if (canRescue) return rescue();
          patch(id, {
            status: "error",
            error: `Este archivo (${formatBytes(entry.size)}) supera lo que cabe en la memoria de este navegador (${formatBytes(LOCAL_HARD_LIMIT)}). Procésalo en la nube.`,
          });
          return;
        }
        if (!entry.report) return;
        // Antes de intentarlo: ¿cabe en la memoria que tiene este navegador?
        const need = estimateLocalMemoryNeed(entry.size, largestImagePixels(entry.report));
        if (need > MEMORY.budget && canRescue) return rescue();
        if (entry.outputUrl) URL.revokeObjectURL(entry.outputUrl);
        patch(id, { status: "compressing", progress: { stage: "open", progress: 0 }, result: null, outputUrl: null, error: null, cancelled: false, rescued: null });
        try {
          if (simulatedOom()) throw new Error("out of memory (simulación)");
          const { bytes, result } = await pool.run(entry.slot, (api) =>
            api.compress(
              id,
              spec,
              progressProxy((e) => patch(id, { progress: e })),
            ),
          );
          if (!getEntry(id)) return;
          const outputUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
          const outputName = outputFileName(spec.output.namePattern, entry.name);
          patch(id, {
            status: "done",
            result,
            outputUrl,
            outputName,
            progress: { stage: "done", progress: 1 },
          });
          useHistoryStore.getState().add({
            id,
            name: entry.name,
            originalSize: result.originalSize,
            outputSize: result.outputSize,
            savings: result.savings,
            preset: result.preset,
            durationMs: result.durationMs,
            at: new Date().toISOString(),
          });
          notifyIfHidden(entry.name, result.savings);
        } catch (err) {
          if (!getEntry(id)) return;
          const message = errorMessage(err);
          if (message === "CANCELLED") {
            patch(id, { status: "ready", progress: null, cancelled: true });
            return;
          }
          if (isMemoryError(err)) {
            // Rescate: el navegador no pudo con el archivo. Si el worker murió, se recrea
            // y se reabren los otros archivos; este sigue en la nube (o queda a un clic de ella).
            if (isFatalEngineError(err)) recoverSlot(entry.slot, id);
            if (canRescue) return rescue();
            patch(id, {
              status: "ready",
              tooLargeForLocal: true,
              error: "El navegador se quedó sin memoria con este archivo.",
              progress: null,
            });
            return;
          }
          patch(id, { status: "error", error: message, progress: null });
        }
      },

      cancel: (id) => {
        const entry = getEntry(id);
        if (!entry) return;
        if (entry.status === "compressing") void pool.direct(entry.slot).cancel(id);
        else if (entry.status === "uploading") uploadAborts.get(id)?.abort();
        else if (entry.status === "cloud" && entry.cloud) void cancelCloudJob(entry.cloud.id);
      },

      cancelAll: () => {
        for (const f of get().files) if (f.status === "compressing" || f.status === "uploading" || f.status === "cloud") get().cancel(f.id);
      },

      cloudAccessCode: "",
      setCloudAccessCode: (code) => set({ cloudAccessCode: code }),
      setForceCloud: (id, on) => patch(id, { forceCloud: on }),

      processInCloud: async (id) => {
        const entry = getEntry(id);
        if (!entry) return;
        const spec = get().spec;
        watchers.get(id)?.();
        watchers.delete(id);
        if (entry.outputUrl) URL.revokeObjectURL(entry.outputUrl);
        const abort = new AbortController();
        uploadAborts.set(id, abort);
        patch(id, { status: "uploading", progress: { stage: "upload", progress: 0, message: "Subiendo" }, result: null, outputUrl: null, error: null, cancelled: false, cloud: null });
        try {
          const uploaded = await uploadToCloud(entry.file, {
            accessCode: get().cloudAccessCode || undefined,
            signal: abort.signal,
            onProgress: (f) => patch(id, { progress: { stage: "upload", progress: f, message: "Subiendo" } }),
          });
          if (!getEntry(id)) return;
          const job = await createCloudJob({
            uploadKey: uploaded.key,
            fileName: entry.name,
            inputSize: uploaded.size,
            spec: { ...spec, password: undefined },
            accessCode: get().cloudAccessCode || undefined,
          });
          patch(id, { status: "cloud", cloud: job, progress: { stage: "queued", progress: 0, message: job.message ?? undefined } });
          const stop = watchCloudJob(job.id, (state) => {
            const current = getEntry(id);
            if (!current) return;
            if (state.status === "done" && state.result) {
              patch(id, {
                status: "done",
                cloud: state,
                result: state.result,
                outputUrl: state.downloadUrl,
                outputName: state.outputName ?? outputFileName(spec.output.namePattern, entry.name),
                progress: { stage: "done", progress: 1 },
              });
              useHistoryStore.getState().add({
                id,
                name: entry.name,
                originalSize: state.result.originalSize,
                outputSize: state.result.outputSize,
                savings: state.result.savings,
                preset: state.result.preset,
                durationMs: state.result.durationMs,
                at: new Date().toISOString(),
              });
              notifyIfHidden(entry.name, state.result.savings);
            } else if (state.status === "failed") {
              patch(id, { status: "error", cloud: state, error: state.error ?? "Error en la nube", progress: null });
            } else if (state.status === "cancelled") {
              patch(id, { status: "ready", cloud: null, cancelled: true, progress: null });
            } else if (state.status === "expired") {
              patch(id, { cloud: state, outputUrl: null });
            } else {
              patch(id, {
                status: "cloud",
                cloud: state,
                progress: { stage: state.stage ?? "processing", progress: state.progress, message: state.message ?? undefined },
              });
            }
          });
          watchers.set(id, stop);
        } catch (err) {
          if (!getEntry(id)) return;
          if (abort.signal.aborted) patch(id, { status: "ready", progress: null, cancelled: true });
          else patch(id, { status: "error", error: errorMessage(err), progress: null });
        } finally {
          uploadAborts.delete(id);
        }
      },

      deleteFromCloud: async (id) => {
        const entry = getEntry(id);
        if (!entry?.cloud) return;
        await deleteCloudJob(entry.cloud.id);
        patch(id, { cloud: { ...entry.cloud, status: "expired", downloadUrl: null }, outputUrl: null });
      },

      notify: false,
      setNotify: (on) => set({ notify: on }),

      autoRescue: true,
      setAutoRescue: (on) => set({ autoRescue: on }),
      cloudConfig: null,

      compressAll: async () => {
        const ids = get()
          .files.filter((f) => f.status === "ready" || f.status === "done" || f.status === "error")
          .filter((f) => f.report)
          .map((f) => f.id);
        await Promise.all(ids.map((id) => get().compressOne(id)));
      },

      unlock: async (id, password) => {
        const entry = getEntry(id);
        if (!entry) return;
        patch(id, { status: "opening", error: null });
        await openAndAnalyze(id, password);
        if (getEntry(id)?.status === "ready") {
          // Guardamos la contraseña para comprimir (el worker la conserva en el documento abierto).
          set((s) => ({ spec: { ...s.spec, password } }));
        }
      },
    }),
    {
      name: "prensa:compress-spec",
      version: 1,
      // Solo persistimos los ajustes (sin contraseña) y la preferencia de aviso; los archivos viven en memoria.
      partialize: (s) => ({ spec: { ...s.spec, password: undefined }, notify: s.notify, cloudAccessCode: s.cloudAccessCode, autoRescue: s.autoRescue }),
      merge: (persisted, current) => {
        const p = persisted as { spec?: unknown; notify?: unknown; cloudAccessCode?: unknown; autoRescue?: unknown } | undefined;
        const parsed = CompressionSpec.safeParse(p?.spec);
        return {
          ...current,
          spec: parsed.success ? parsed.data : current.spec,
          notify: p?.notify === true,
          cloudAccessCode: typeof p?.cloudAccessCode === "string" ? p.cloudAccessCode : "",
          autoRescue: p?.autoRescue !== false,
        };
      },
    },
  ),
);

function notifyIfHidden(name: string, savings: number): void {
  if (!useCompressStore.getState().notify) return;
  if (typeof document === "undefined" || !document.hidden) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification("Prensa · PDF listo", {
      body: `${name} · ${Math.round(savings * 100)} % más liviano`,
      tag: `prensa-${name}`,
      icon: "/icon-192.png",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* sin notificaciones */
  }
}

/** Totales útiles para la UI. */
export function selectTotals(files: FileEntry[], preset: PresetId) {
  let original = 0;
  let estimated = 0;
  let output = 0;
  let ready = 0;
  let done = 0;
  for (const f of files) {
    if (f.report || (f.tooLargeForLocal && (f.status === "ready" || f.status === "error"))) {
      ready++;
      original += f.size;
      estimated += f.report?.estimates[preset]?.bytes ?? Math.round(f.size * 0.6);
    }
    if (f.status === "done" && f.result) {
      done++;
      output += f.result.outputSize;
    }
  }
  return { original, estimated, output, ready, done, count: files.length };
}
