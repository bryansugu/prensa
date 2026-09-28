/**
 * Web Worker del motor. La UI habla con él vía Comlink (ver client.ts).
 * Mantiene los documentos abiertos por id para analizar, previsualizar y
 * comprimir sin re-parsear.
 */
import * as Comlink from "comlink";
import type { AnalysisReport, ComposeResult, ComposeSpecInput, CompressionResult, CompressionSpecInput, ProgressEvent } from "@prensa/schema";
import { analyzeDocument } from "../analyze";
import { initCodecs } from "../codecs";
import { composeDocument, type ComposeSource } from "../compose";
import { openDocument, PasswordRequiredError } from "../compress";
import { compressToTarget } from "../target";
import { loadMupdf, type Mu, type PDFDocument } from "../mupdf";

interface OpenDoc {
  bytes: Uint8Array;
  name: string;
  password: string | undefined;
  doc: PDFDocument;
}

export interface OpenResult {
  pageCount: number;
}

export interface RenderResult {
  width: number;
  height: number;
  png: Uint8Array;
}

export interface CompressResult {
  bytes: Uint8Array;
  result: CompressionResult;
}

export interface ComposeWorkerResult {
  bytes: Uint8Array;
  result: ComposeResult;
}

class EngineWorker {
  private docs = new Map<string, OpenDoc>();
  private aborts = new Map<string, AbortController>();
  private mupdfPromise: Promise<Mu> | null = null;
  private mupdfReady: Mu | null = null;

  private mupdf(): Promise<Mu> {
    this.mupdfPromise ??= (async () => {
      const [mu] = await Promise.all([loadMupdf(), initCodecs()]);
      this.mupdfReady = mu;
      return mu;
    })();
    return this.mupdfPromise;
  }

  async warmup(): Promise<void> {
    await this.mupdf();
  }

  /** Abre un documento. Lanza PasswordRequiredError si necesita contraseña. */
  async open(id: string, bytes: Uint8Array, name: string, password?: string): Promise<OpenResult> {
    const mu = await this.mupdf();
    this.close(id);
    try {
      const doc = openDocument(mu, bytes, password);
      this.docs.set(id, { bytes, name, password, doc });
      return { pageCount: doc.countPages() };
    } catch (err) {
      if (err instanceof PasswordRequiredError) throw new Error("PASSWORD_REQUIRED", { cause: err });
      throw err;
    }
  }

  async analyze(id: string): Promise<AnalysisReport> {
    const mu = await this.mupdf();
    const entry = this.must(id);
    return analyzeDocument(mu, entry.doc, entry.name, entry.bytes.length).report;
  }

  async compress(
    id: string,
    spec: CompressionSpecInput,
    onProgress?: (e: ProgressEvent) => void,
  ): Promise<CompressResult> {
    const mu = await this.mupdf();
    const entry = this.must(id);
    const controller = new AbortController();
    this.aborts.set(id, controller);
    try {
      const out = await compressToTarget(mu, entry.bytes, { ...spec, password: entry.password }, {
        fileName: entry.name,
        signal: controller.signal,
        onProgress: onProgress ? (e) => void onProgress(e) : undefined,
      });
      // Copia para el comparador: el original queda abierto; el resultado se
      // abre bajo `${id}:out` (se cierra con closeOutput o close).
      this.setOutput(id, out.bytes.slice());
      return Comlink.transfer({ bytes: out.bytes, result: out.result }, [out.bytes.buffer as ArrayBuffer]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw new Error("CANCELLED", { cause: err });
      throw err;
    } finally {
      this.aborts.delete(id);
    }
  }

  /**
   * Une/compone páginas de documentos ya abiertos en este worker (ver
   * compose.ts). `jobId` sirve para cancelar con cancel(jobId).
   */
  async compose(
    jobId: string,
    spec: ComposeSpecInput,
    onProgress?: (done: number, total: number) => void,
  ): Promise<ComposeWorkerResult> {
    const mu = await this.mupdf();
    const sources = new Map<string, ComposeSource>();
    for (const ref of spec.pages) {
      if (sources.has(ref.source)) continue;
      const entry = this.must(ref.source);
      sources.set(ref.source, { name: entry.name, doc: entry.doc });
    }
    const controller = new AbortController();
    this.aborts.set(jobId, controller);
    try {
      const out = await composeDocument(mu, sources, spec, {
        signal: controller.signal,
        onProgress: onProgress ? (d, t) => void onProgress(d, t) : undefined,
      });
      return Comlink.transfer({ bytes: out.bytes, result: out.result }, [out.bytes.buffer as ArrayBuffer]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw new Error("CANCELLED", { cause: err });
      throw err;
    } finally {
      this.aborts.delete(jobId);
    }
  }

  /** Cancela una compresión o composición en curso (se aplica entre etapas). */
  cancel(id: string): boolean {
    const c = this.aborts.get(id);
    if (!c) return false;
    c.abort();
    return true;
  }

  /** Abre el PDF resultante bajo `${id}:out` para renderizar el comparador. */
  private setOutput(id: string, bytes: Uint8Array): void {
    const key = `${id}:out`;
    this.close(key);
    const entry = this.docs.get(id);
    const mu = this.mupdfReady;
    if (!entry || !mu) return;
    try {
      const doc = openDocument(mu, bytes, entry.password);
      this.docs.set(key, { bytes, name: entry.name, password: entry.password, doc });
    } catch {
      /* sin comparador para este archivo */
    }
  }

  closeOutput(id: string): void {
    this.close(`${id}:out`);
  }

  /** Renderiza una página del documento abierto a PNG. */
  async renderPage(id: string, index: number, scale: number): Promise<RenderResult> {
    const mu = await this.mupdf();
    return this.render(mu, this.must(id).doc, index, scale);
  }

  /** Renderiza una página de bytes arbitrarios (p. ej. el resultado comprimido). */
  async renderBytes(bytes: Uint8Array, index: number, scale: number, password?: string): Promise<RenderResult> {
    const mu = await this.mupdf();
    const doc = openDocument(mu, bytes, password);
    try {
      return this.render(mu, doc, index, scale);
    } finally {
      doc.destroy();
    }
  }

  private render(mu: Mu, doc: PDFDocument, index: number, scale: number): RenderResult {
    const page = doc.loadPage(index);
    try {
      const pix = page.toPixmap(mu.Matrix.scale(scale, scale), mu.ColorSpace.DeviceRGB, false, true);
      try {
        const png = new Uint8Array(pix.asPNG());
        return Comlink.transfer({ width: pix.getWidth(), height: pix.getHeight(), png }, [png.buffer]);
      } finally {
        pix.destroy();
      }
    } finally {
      page.destroy();
    }
  }

  close(id: string): void {
    if (!id.endsWith(":out")) this.close(`${id}:out`);
    const entry = this.docs.get(id);
    if (!entry) return;
    try {
      entry.doc.destroy();
    } catch {
      /* ignore */
    }
    this.docs.delete(id);
  }

  private must(id: string): OpenDoc {
    const entry = this.docs.get(id);
    if (!entry) throw new Error(`Documento no abierto: ${id}`);
    return entry;
  }
}

export type EngineApi = EngineWorker;

Comlink.expose(new EngineWorker());
