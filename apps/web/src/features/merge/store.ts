/**
 * Estado de "Unir": documentos de origen (abiertos en el worker, con
 * miniaturas), la secuencia de páginas del resultado y el trabajo de
 * composición. Nada se persiste: los PDF viven solo en memoria.
 */
import { Comlink, progressProxy } from "@prensa/engine/client";
import { defaultSpec, type ComposeResult, type CompressionResult, type Rotation } from "@prensa/schema";
import { create } from "zustand";
import { mergeApi, resetMergeEngine, runSerial } from "./engine";

export const MAX_SOURCES = 20;
/** Escala de render de miniaturas (carta → ~170 px de ancho). */
export const THUMB_SCALE = 0.28;
/** Páginas con miniatura por documento; el resto se muestra como número. */
const THUMB_LIMIT = 400;
const THUMB_BATCH = 4;
const MERGED_ID = "__merged";

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const letterOf = (index: number) => LETTERS[index % LETTERS.length]! + (index >= LETTERS.length ? String(Math.floor(index / LETTERS.length) + 1) : "");

export interface PageRef {
  source: string;
  page: number;
}
export const selKey = (r: PageRef) => `${r.source}:${r.page}`;

export interface Source {
  id: string;
  name: string;
  size: number;
  /** Posición estable (letra y color); no cambia al quitar otros documentos. */
  index: number;
  status: "opening" | "ready" | "error";
  error: string | null;
  pageCount: number;
  thumbs: (string | null)[];
}

export interface OutputPage extends PageRef {
  key: string;
  rotate: Rotation;
}

export interface MergeOptions {
  name: string;
  bookmarks: boolean;
  compress: boolean;
}

export interface MergeResult {
  url: string;
  name: string;
  size: number;
  pageCount: number;
  compose: ComposeResult;
  compression: CompressionResult | null;
}

export interface MergeJob {
  status: "idle" | "composing" | "compressing" | "done" | "error";
  progress: number;
  message: string;
  error: string | null;
  result: MergeResult | null;
}

interface MergeState {
  sources: Source[];
  sequence: OutputPage[];
  selected: string[];
  options: MergeOptions;
  job: MergeJob;
  nextIndex: number;

  addFiles: (files: File[]) => void;
  removeSource: (id: string) => void;
  toggleSelected: (ref: PageRef) => void;
  selectAll: (sourceId: string) => void;
  clearSelection: () => void;
  appendAll: (sourceId: string) => void;
  insertRefs: (refs: PageRef[], at: number | null) => void;
  insertSelected: (at: number | null) => void;
  movePage: (from: number, to: number) => void;
  removePage: (key: string) => void;
  rotatePage: (key: string) => void;
  duplicatePage: (key: string) => void;
  clearSequence: () => void;
  setOption: <K extends keyof MergeOptions>(key: K, value: MergeOptions[K]) => void;
  compose: () => Promise<void>;
  cancel: () => void;
  resetJob: () => void;
  resetAll: () => void;
}

const idleJob: MergeJob = { status: "idle", progress: 0, message: "", error: null, result: null };
let currentJobId: string | null = null;

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("PASSWORD_REQUIRED")) return "Este PDF tiene contraseña. Quítala primero (o comprímelo con la contraseña) para poder unirlo.";
  if (raw.includes("CANCELLED")) return "CANCELLED";
  if (/not a PDF|no objects found|cannot find startxref|unknown format/i.test(raw)) return "El archivo no es un PDF válido o está dañado.";
  if (/memory|allocation|out of memory|RangeError/i.test(raw)) return "No hay memoria suficiente en el navegador para este archivo.";
  return raw || "Error desconocido";
}

/** Nombre de salida por defecto: el del primer documento + «-unido». */
export function defaultOutputName(sources: Source[]): string {
  const first = sources[0];
  if (!first) return "unido.pdf";
  return `${first.name.replace(/\.pdf$/i, "")}-unido.pdf`;
}

export function outputName(state: Pick<MergeState, "sources" | "options">): string {
  const raw = state.options.name.trim();
  if (!raw) return defaultOutputName(state.sources);
  const clean = raw.replace(/[\\/:*?"<>|]+/g, "-");
  return /\.pdf$/i.test(clean) ? clean : `${clean}.pdf`;
}

export const useMergeStore = create<MergeState>()((set, get) => {
  const patchSource = (id: string, patch: Partial<Source>) =>
    set((s) => ({ sources: s.sources.map((src) => (src.id === id ? { ...src, ...patch } : src)) }));
  const getSource = (id: string) => get().sources.find((s) => s.id === id);
  const setThumb = (id: string, page: number, url: string) => {
    const src = getSource(id);
    if (!src) {
      URL.revokeObjectURL(url);
      return;
    }
    const thumbs = src.thumbs.slice();
    thumbs[page] = url;
    patchSource(id, { thumbs });
  };
  const patchJob = (patch: Partial<MergeJob>) => set((s) => ({ job: { ...s.job, ...patch } }));

  async function openSource(id: string, file: File): Promise<void> {
    try {
      const buffer = await file.arrayBuffer();
      const pageCount = await runSerial(async (api) => {
        const bytes = new Uint8Array(buffer);
        const res = await api.open(id, Comlink.transfer(bytes, [bytes.buffer]), file.name);
        if (!getSource(id)) {
          void api.close(id);
          return 0;
        }
        return res.pageCount;
      });
      if (!getSource(id)) return;
      patchSource(id, { status: "ready", pageCount, thumbs: Array<string | null>(pageCount).fill(null) });
      // Miniaturas en lotes cortos para no bloquear otras operaciones del worker.
      const limit = Math.min(pageCount, THUMB_LIMIT);
      for (let start = 0; start < limit; start += THUMB_BATCH) {
        if (!getSource(id)) return;
        await runSerial(async (api) => {
          for (let p = start; p < Math.min(start + THUMB_BATCH, limit); p++) {
            if (!getSource(id)) return;
            const r = await api.renderPage(id, p, THUMB_SCALE);
            setThumb(id, p, URL.createObjectURL(new Blob([r.png as BlobPart], { type: "image/png" })));
          }
        });
      }
    } catch (err) {
      if (getSource(id)) patchSource(id, { status: "error", error: errorMessage(err) });
    }
  }

  return {
    sources: [],
    sequence: [],
    selected: [],
    options: { name: "", bookmarks: true, compress: false },
    job: idleJob,
    nextIndex: 0,

    addFiles: (incoming) => {
      const { sources, nextIndex } = get();
      const room = Math.max(0, MAX_SOURCES - sources.length);
      const list = [...incoming].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf").slice(0, room);
      if (list.length === 0) return;
      const entries: Source[] = list.map((file, i) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        index: nextIndex + i,
        status: "opening",
        error: null,
        pageCount: 0,
        thumbs: [],
      }));
      set({ sources: [...sources, ...entries], nextIndex: nextIndex + entries.length });
      entries.forEach((e, i) => void openSource(e.id, list[i]!));
    },

    removeSource: (id) => {
      const src = getSource(id);
      if (!src) return;
      for (const url of src.thumbs) if (url) URL.revokeObjectURL(url);
      set((s) => ({
        sources: s.sources.filter((x) => x.id !== id),
        sequence: s.sequence.filter((p) => p.source !== id),
        selected: s.selected.filter((k) => !k.startsWith(`${id}:`)),
      }));
      void runSerial(async (api) => api.close(id)).catch(() => undefined);
    },

    toggleSelected: (ref) => {
      const key = selKey(ref);
      set((s) => ({ selected: s.selected.includes(key) ? s.selected.filter((k) => k !== key) : [...s.selected, key] }));
    },
    selectAll: (sourceId) => {
      const src = getSource(sourceId);
      if (!src) return;
      const keys = Array.from({ length: src.pageCount }, (_, p) => selKey({ source: sourceId, page: p }));
      set((s) => {
        const allSelected = keys.every((k) => s.selected.includes(k));
        return { selected: allSelected ? s.selected.filter((k) => !keys.includes(k)) : [...new Set([...s.selected, ...keys])] };
      });
    },
    clearSelection: () => set({ selected: [] }),

    appendAll: (sourceId) => {
      const src = getSource(sourceId);
      if (!src || src.status !== "ready") return;
      get().insertRefs(
        Array.from({ length: src.pageCount }, (_, p) => ({ source: sourceId, page: p })),
        null,
      );
    },
    insertRefs: (refs, at) => {
      if (refs.length === 0) return;
      const pages: OutputPage[] = refs.map((r) => ({ ...r, key: crypto.randomUUID(), rotate: 0 }));
      set((s) => {
        const index = at == null ? s.sequence.length : Math.max(0, Math.min(at, s.sequence.length));
        return { sequence: [...s.sequence.slice(0, index), ...pages, ...s.sequence.slice(index)] };
      });
      get().resetJob();
    },
    insertSelected: (at) => {
      const { selected, sources } = get();
      if (selected.length === 0) return;
      const order = new Map(sources.map((s, i) => [s.id, i]));
      const refs = selected
        .map((k) => {
          const i = k.lastIndexOf(":");
          return { source: k.slice(0, i), page: Number(k.slice(i + 1)) };
        })
        .filter((r) => order.has(r.source))
        .sort((a, b) => order.get(a.source)! - order.get(b.source)! || a.page - b.page);
      get().insertRefs(refs, at);
      set({ selected: [] });
    },

    movePage: (from, to) => {
      set((s) => {
        if (from === to || from < 0 || to < 0 || from >= s.sequence.length || to >= s.sequence.length) return {};
        const next = s.sequence.slice();
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item!);
        return { sequence: next };
      });
      get().resetJob();
    },
    removePage: (key) => {
      set((s) => ({ sequence: s.sequence.filter((p) => p.key !== key) }));
      get().resetJob();
    },
    rotatePage: (key) => {
      set((s) => ({
        sequence: s.sequence.map((p) => (p.key === key ? { ...p, rotate: (((p.rotate + 90) % 360) as Rotation) } : p)),
      }));
      get().resetJob();
    },
    duplicatePage: (key) => {
      set((s) => {
        const i = s.sequence.findIndex((p) => p.key === key);
        if (i < 0) return {};
        const copy: OutputPage = { ...s.sequence[i]!, key: crypto.randomUUID() };
        return { sequence: [...s.sequence.slice(0, i + 1), copy, ...s.sequence.slice(i + 1)] };
      });
      get().resetJob();
    },
    clearSequence: () => {
      set({ sequence: [] });
      get().resetJob();
    },

    setOption: (key, value) => {
      set((s) => ({ options: { ...s.options, [key]: value } }));
      // Las opciones cambian el resultado: vuelve a ofrecer «Unir».
      get().resetJob();
    },

    compose: async () => {
      const { sequence, options, sources } = get();
      if (sequence.length === 0 || get().job.status === "composing" || get().job.status === "compressing") return;
      get().resetJob();
      const jobId = `merge-${crypto.randomUUID()}`;
      currentJobId = jobId;
      const name = outputName({ sources, options });
      patchJob({ status: "composing", progress: 0, message: "Uniendo páginas", error: null });
      try {
        const composed = await runSerial((api) =>
          api.compose(
            jobId,
            {
              pages: sequence.map((p) => ({ source: p.source, page: p.page, rotate: p.rotate })),
              bookmarks: options.bookmarks,
              title: name.replace(/\.pdf$/i, ""),
            },
            Comlink.proxy((done: number, total: number) => {
              if (currentJobId === jobId) patchJob({ progress: (options.compress ? 0.5 : 1) * (done / Math.max(1, total)), message: `Página ${done} de ${total}` });
            }),
          ),
        );
        if (currentJobId !== jobId) return;
        let bytes = composed.bytes;
        let compression: CompressionResult | null = null;
        if (options.compress) {
          patchJob({ status: "compressing", progress: 0.5, message: "Comprimiendo el resultado" });
          const out = await runSerial(async (api) => {
            const copy = bytes.slice();
            await api.open(MERGED_ID, Comlink.transfer(copy, [copy.buffer]), name);
            try {
              return await api.compress(
                MERGED_ID,
                defaultSpec("smart"),
                progressProxy((e) => {
                  if (currentJobId === jobId) patchJob({ progress: 0.5 + 0.5 * e.progress, message: e.message ?? "Comprimiendo" });
                }),
              );
            } finally {
              void api.close(MERGED_ID);
            }
          });
          if (currentJobId !== jobId) return;
          bytes = out.bytes;
          compression = out.result;
        }
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        patchJob({
          status: "done",
          progress: 1,
          message: "Listo",
          result: { url, name, size: bytes.length, pageCount: composed.result.pageCount, compose: composed.result, compression },
        });
      } catch (err) {
        if (currentJobId !== jobId) return;
        const message = errorMessage(err);
        if (message === "CANCELLED") patchJob({ ...idleJob });
        else patchJob({ status: "error", error: message, message: "" });
      } finally {
        if (currentJobId === jobId) currentJobId = null;
      }
    },

    cancel: () => {
      const id = currentJobId;
      if (!id) return;
      const api = mergeApi();
      void api.cancel(id);
      void api.cancel(MERGED_ID);
      currentJobId = null;
      patchJob({ ...idleJob });
    },

    resetJob: () => {
      const { job } = get();
      if (job.status === "idle") return;
      if (job.result) URL.revokeObjectURL(job.result.url);
      set({ job: idleJob });
    },

    resetAll: () => {
      const { sources, job } = get();
      for (const s of sources) for (const url of s.thumbs) if (url) URL.revokeObjectURL(url);
      if (job.result) URL.revokeObjectURL(job.result.url);
      currentJobId = null;
      resetMergeEngine();
      set({ sources: [], sequence: [], selected: [], job: idleJob, options: { name: "", bookmarks: true, compress: false } });
    },
  };
});
