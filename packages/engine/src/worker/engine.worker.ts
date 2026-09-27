/**
 * Web Worker del motor. La UI habla con él vía Comlink (ver client.ts).
 * Mantiene los documentos abiertos por id para analizar, previsualizar y
 * comprimir sin re-parsear.
 */
import * as Comlink from "comlink";
import type { AnalysisReport, CompressionResult, CompressionSpecInput, ProgressEvent } from "@prensa/schema";
import { analyzeDocument } from "../analyze";
import { initCodecs } from "../codecs";
import { compressPdf, openDocument, PasswordRequiredError } from "../compress";
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

class EngineWorker {
  private docs = new Map<string, OpenDoc>();
  private mupdfPromise: Promise<Mu> | null = null;

  private mupdf(): Promise<Mu> {
    this.mupdfPromise ??= (async () => {
      const [mu] = await Promise.all([loadMupdf(), initCodecs()]);
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
    const out = await compressPdf(mu, entry.bytes, { ...spec, password: entry.password }, {
      fileName: entry.name,
      onProgress: onProgress ? (e) => void onProgress(e) : undefined,
    });
    return Comlink.transfer({ bytes: out.bytes, result: out.result }, [out.bytes.buffer as ArrayBuffer]);
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
