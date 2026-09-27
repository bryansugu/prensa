/**
 * Estado de la herramienta "Comprimir": archivos, análisis, ajustes y
 * resultados. Orquesta el motor (workers) a través del pool.
 */
import { Comlink, progressProxy } from "@prensa/engine/client";
import {
  CompressionSpec,
  defaultSpec,
  outputFileName,
  type AnalysisReport,
  type CompressionResult,
  type PresetId,
  type ProgressEvent,
} from "@prensa/schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { pool } from "./engine-pool";
import { useHistoryStore } from "./history";

export type FileStatus = "opening" | "analyzing" | "ready" | "compressing" | "done" | "error" | "password";

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
}

const MAX_FILES = 50;

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
    else patch(id, { status: "error", error: message });
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
        }));
        set({ files: [...current, ...entries] });
        for (const e of entries) void openAndAnalyze(e.id);
      },

      removeFile: (id) => {
        const entry = getEntry(id);
        if (!entry) return;
        revoke(entry);
        pool.release(entry.slot);
        void pool.run(entry.slot, async (api) => api.close(id)).catch(() => undefined);
        set((s) => ({ files: s.files.filter((f) => f.id !== id) }));
      },

      clear: () => {
        for (const f of get().files) {
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
        if (!entry.report) return;
        const spec = get().spec;
        if (entry.outputUrl) URL.revokeObjectURL(entry.outputUrl);
        patch(id, { status: "compressing", progress: { stage: "open", progress: 0 }, result: null, outputUrl: null, error: null, cancelled: false });
        try {
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
          if (message === "CANCELLED") patch(id, { status: "ready", progress: null, cancelled: true });
          else patch(id, { status: "error", error: message, progress: null });
        }
      },

      cancel: (id) => {
        const entry = getEntry(id);
        if (!entry || entry.status !== "compressing") return;
        void pool.direct(entry.slot).cancel(id);
      },

      cancelAll: () => {
        for (const f of get().files) if (f.status === "compressing") get().cancel(f.id);
      },

      notify: false,
      setNotify: (on) => set({ notify: on }),

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
      partialize: (s) => ({ spec: { ...s.spec, password: undefined }, notify: s.notify }),
      merge: (persisted, current) => {
        const p = persisted as { spec?: unknown; notify?: unknown } | undefined;
        const parsed = CompressionSpec.safeParse(p?.spec);
        return { ...current, spec: parsed.success ? parsed.data : current.spec, notify: p?.notify === true };
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
    if (f.report) {
      ready++;
      original += f.size;
      estimated += f.report.estimates[preset]?.bytes ?? f.size;
    }
    if (f.status === "done" && f.result) {
      done++;
      output += f.result.outputSize;
    }
  }
  return { original, estimated, output, ready, done, count: files.length };
}
