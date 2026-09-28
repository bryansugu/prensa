/**
 * Orquestador del pipeline local. Ver plan §5.2:
 * abrir → (aplanar) → analizar → imágenes in-place → limpieza → guardar →
 * subset de fuentes verificado → verificar → nunca devolver algo más grande.
 */
import {
  CompressionSpec,
  formatBytes,
  resolveImageParams,
  type CompressionResult,
  type CompressionSpecInput,
  type ProgressEvent,
  type SizeBreakdown,
  type Stage,
} from "@prensa/schema";
import { analyzeDocument, normalizeText, type AnalysisContext } from "./analyze";
import { processImage, throwIfAborted, type ImageOutcome } from "./images/process";
import type { Mu, PDFDocument } from "./mupdf";
import { applyCleanup } from "./pdf/cleanup";
import { get, resolveDict, streamLength } from "./pdf/objects";
import { verifyOutput } from "./pdf/verify";
import { walkDocument } from "./pdf/walk";
import { rasterizeDocument } from "./rasterize";
import { smartParams } from "./smart";

export interface CompressOptions {
  fileName: string;
  onProgress?: ((e: ProgressEvent) => void) | undefined;
  signal?: AbortSignal | undefined;
  /** Esfuerzo de compresión Flate (0-100). Más alto = más lento y algo más pequeño. */
  compressEffort?: number;
}

export interface CompressOutput {
  bytes: Uint8Array;
  result: CompressionResult;
  /** Detalle por imagen (para el reporte y el benchmark) */
  images: ImageOutcome[];
}

export class PasswordRequiredError extends Error {
  constructor() {
    super("El PDF está protegido con contraseña");
    this.name = "PasswordRequiredError";
  }
}

export function openDocument(mupdf: Mu, bytes: Uint8Array, password?: string): PDFDocument {
  const doc = new mupdf.PDFDocument(bytes);
  if (doc.needsPassword()) {
    if (!password || doc.authenticatePassword(password) === 0) {
      doc.destroy();
      throw new PasswordRequiredError();
    }
  }
  return doc;
}

export async function compressPdf(
  mupdf: Mu,
  input: Uint8Array,
  specInput: CompressionSpecInput,
  opts: CompressOptions,
): Promise<CompressOutput> {
  const t0 = now();
  const spec = CompressionSpec.parse(specInput);
  let params = resolveImageParams(spec);
  const emit = (stage: Stage, progress: number, extra?: Partial<ProgressEvent>) =>
    opts.onProgress?.({ stage, progress: clamp01(progress), ...extra });

  emit("open", 0.01, { message: "Abriendo documento" });
  const doc = openDocument(mupdf, input, spec.password);
  const notes: string[] = [];
  const imageOutcomes: ImageOutcome[] = [];
  let analysis: AnalysisContext | null = null;

  try {
    // ── Rasterizar: camino aparte ──────────────────────────────────
    if (spec.mode === "rasterize") {
      analysis = analyzeDocument(mupdf, doc, opts.fileName, input.length, { signal: opts.signal, maxSamplePages: 4 });
      const bytes = await rasterizeDocument(mupdf, doc, spec, params, {
        signal: opts.signal,
        onPage: (i, total) => emit("images", 0.1 + (0.85 * i) / Math.max(1, total), { current: i + 1, total }),
      });
      notes.push("Rasterizado: el texto y la interactividad se convirtieron en imagen.");
      return finish(bytes, analysis, true);
    }

    // ── Aplanar formularios / anotaciones ──────────────────────────
    if (spec.flatten.forms || spec.flatten.annotations) {
      try {
        doc.bake(spec.flatten.annotations, spec.flatten.forms);
        notes.push(spec.flatten.forms ? "Formularios aplanados" : "Anotaciones aplanadas");
      } catch {
        notes.push("No se pudieron aplanar las anotaciones; se conservaron.");
      }
    }

    // ── Análisis (sobre el documento que vamos a modificar) ────────
    emit("analyze", 0.03, { message: "Analizando" });
    analysis = analyzeDocument(mupdf, doc, opts.fileName, input.length, {
      signal: opts.signal,
      onProgress: (p) => emit("analyze", 0.03 + 0.09 * p),
    });
    throwIfAborted(opts.signal);
    if (spec.preset === "smart") {
      // Inteligente: parámetros según el tipo de documento (los overrides manuales mandan).
      const smart = smartParams(analysis.report);
      params = resolveImageParams({ ...spec, preset: "balanced" });
      params = {
        ...smart,
        colorDpi: spec.images.colorDpi ?? smart.colorDpi,
        monoDpi: spec.images.monoDpi ?? smart.monoDpi,
        photoQuality: spec.images.jpegQuality ?? smart.photoQuality,
        graphicQuality: spec.images.jpegQuality != null ? Math.min(100, spec.images.jpegQuality + 8) : smart.graphicQuality,
        chroma: spec.images.chroma === "auto" ? smart.chroma : spec.images.chroma,
        minSsim: spec.images.minSsim ?? smart.minSsim,
      };
      notes.push(`Inteligente: documento ${analysis.report.docType} → ${params.colorDpi} dpi, JPEG ${params.photoQuality}`);
    }

    // ── Imágenes ───────────────────────────────────────────────────
    const refs = [...analysis.walk.images.values()].sort(
      (a, b) => (analysis!.imageInfos.get(b.objectNumber)?.bytes ?? 0) - (analysis!.imageInfos.get(a.objectNumber)?.bytes ?? 0),
    );
    const total = refs.length;
    const ctx = { mupdf, doc, params, spec, signal: opts.signal };
    for (let i = 0; i < total; i++) {
      // Cede el event loop: en el worker esto permite procesar cancel() y
      // otros mensajes entre imágenes (los awaits internos son solo microtareas).
      await yieldToEventLoop();
      throwIfAborted(opts.signal);
      const ref = refs[i]!;
      const info = analysis.imageInfos.get(ref.objectNumber)!;
      emit("images", 0.12 + (0.66 * i) / Math.max(1, total), {
        current: i + 1,
        total,
        message: `Imagen ${i + 1} de ${total}`,
      });
      try {
        imageOutcomes.push(await processImage(ctx, ref, info, analysis.placements.get(ref.objectNumber)));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        imageOutcomes.push({
          objectNumber: ref.objectNumber,
          action: "skipped",
          reason: "error",
          beforeBytes: info.bytes,
          afterBytes: info.bytes,
          ssim: null,
          width: info.width,
          height: info.height,
        });
      }
      if (i % 8 === 7) mupdf.shrinkStore(50);
    }

    // ── Limpieza estructural ───────────────────────────────────────
    emit("cleanup", 0.8, { message: "Limpiando estructura" });
    const cleanup = applyCleanup(doc, spec, analysis.report.features);
    notes.push(...cleanup.notes);
    if (cleanup.attachmentsBytes > 0 && cleanup.attachmentsBytes >= input.length * 0.05) {
      notes.push(`Adjuntos conservados (${formatBytes(cleanup.attachmentsBytes)}); desactiva «Conservar adjuntos» para quitarlos.`);
    }

    // ── Guardar ────────────────────────────────────────────────────
    emit("save", 0.84, { message: "Guardando" });
    const keepEncryption = analysis.report.features.encrypted && spec.preserve.encryption;
    const saveOpts = buildSaveOptions(opts.compressEffort ?? 80, keepEncryption);
    let bytes = saveDoc(doc, saveOpts);
    throwIfAborted(opts.signal);

    // ── Subset de fuentes (experimental en MuPDF): en copia y verificado ──
    let fontsSubset = false;
    if (analysis.report.fonts.embedded > analysis.report.fonts.subset) {
      emit("fonts", 0.9, { message: "Subconjunto de fuentes" });
      const subsetBytes = trySubsetFonts(mupdf, bytes, analysis, spec.password, saveOpts);
      if (subsetBytes && subsetBytes.length < bytes.length) {
        bytes = subsetBytes;
        fontsSubset = true;
        notes.push("Fuentes reducidas a los glifos usados");
      }
    }

    return finish(bytes, analysis, false, fontsSubset);
  } finally {
    doc.destroy();
  }

  // ───────────────────────────────────────────────────────────────
  function finish(bytes: Uint8Array, ctx: AnalysisContext, rasterized: boolean, fontsSubset = false): CompressOutput {
    emit("verify", 0.95, { message: "Verificando" });
    const original = openDocument(mupdf, input, spec.password);
    let output: PDFDocument | null = null;
    let verification: CompressionResult["verification"];
    let after: SizeBreakdown = { images: 0, fonts: 0, content: 0, metadata: 0, other: 0 };
    try {
      output = openDocument(mupdf, bytes, spec.preserve.encryption ? spec.password : undefined);
      const f = ctx.report.features;
      verification = verifyOutput(mupdf, original, output, {
        samplePages: ctx.samplePages,
        sampleText: ctx.sampleText,
        sampleAnnots: ctx.sampleAnnots,
        expectText: !rasterized,
        expectAnnots: !rasterized && spec.preserve.annotations && spec.preserve.links && spec.preserve.forms && !spec.flatten.annotations && !spec.flatten.forms,
        expectForm: !rasterized && f.forms && spec.preserve.forms && !spec.flatten.forms,
        expectOutlines: !rasterized && f.bookmarks && spec.preserve.bookmarks,
      });
      after = measureBreakdown(output, bytes.length);
    } catch {
      verification = { pagesOk: false, textOk: false, pageSsimMin: null, interactivityOk: false };
    } finally {
      output?.destroy();
      original.destroy();
    }

    let finalBytes = bytes;
    let returnedOriginal = false;
    if (!verification.pagesOk || (!rasterized && !verification.textOk)) {
      finalBytes = input;
      returnedOriginal = true;
      notes.push(
        !verification.pagesOk
          ? "La verificación falló (páginas); se entrega el archivo original sin cambios."
          : "El texto no coincidió tras comprimir; se entrega el archivo original sin cambios.",
      );
    } else if (bytes.length >= input.length && !rasterized) {
      // Rasterizar es una transformación pedida explícitamente (aplanar todo):
      // se entrega aunque no ahorre. En modo preservar, nunca agrandamos.
      finalBytes = input;
      returnedOriginal = true;
      notes.push("El PDF ya estaba optimizado: no se encontró forma de reducirlo sin perder calidad.");
    } else if (rasterized && bytes.length >= input.length) {
      notes.push("El rasterizado no redujo el tamaño (el original tenía poco contenido gráfico).");
    }

    const recompressed = imageOutcomes.filter((o) => o.action === "recompressed" || o.action === "downsampled");
    const result: CompressionResult = {
      originalSize: input.length,
      outputSize: finalBytes.length,
      savings: input.length > 0 ? Math.max(0, 1 - finalBytes.length / input.length) : 0,
      durationMs: Math.round(now() - t0),
      preset: spec.preset,
      imagesTotal: imageOutcomes.length,
      imagesRecompressed: recompressed.length,
      imagesDownsampled: imageOutcomes.filter((o) => o.action === "downsampled").length,
      fontsSubset,
      breakdown: { before: ctx.report.breakdown, after: returnedOriginal ? ctx.report.breakdown : after },
      verification,
      returnedOriginal,
      notes,
    };
    emit("done", 1, { message: "Listo" });
    return { bytes: finalBytes, result, images: imageOutcomes };
  }
}

export function buildSaveOptions(_effort: number, keepEncryption: boolean): string {
  // Notas: `compress-effort` existe en mutool pero el build WASM 1.28.1 lo rechaza
  // ("Unused pdf arguments"). `sanitize` NO se usa: reescribe los content streams y
  // en PDFs de InDesign cambia el texto extraíble (duplica caracteres en 35/44
  // páginas de un catálogo real), lo que hacía fallar la verificación y devolver
  // el original. Ahorraba como mucho unos KB.
  const parts = [
    "garbage=deduplicate",
    "compress",
    "compress-fonts",
    "compress-images",
    "objstms",
    keepEncryption ? "encrypt=keep" : "encrypt=none",
  ];
  return parts.join(",");
}

export function saveDoc(doc: PDFDocument, options: string): Uint8Array {
  const buf = doc.saveToBuffer(options);
  try {
    return new Uint8Array(buf.asUint8Array());
  } finally {
    buf.destroy();
  }
}

function trySubsetFonts(
  mupdf: Mu,
  bytes: Uint8Array,
  ctx: AnalysisContext,
  password: string | undefined,
  saveOpts: string,
): Uint8Array | null {
  let doc: PDFDocument | null = null;
  let check: PDFDocument | null = null;
  try {
    doc = openDocument(mupdf, bytes, password);
    doc.subsetFonts();
    const out = saveDoc(doc, saveOpts);
    // El texto debe extraerse idéntico en las páginas de muestra.
    check = openDocument(mupdf, out, password);
    for (const i of ctx.samplePages) {
      const page = check.loadPage(i);
      try {
        const st = page.toStructuredText("preserve-whitespace");
        const text = normalizeText(st.asText());
        st.destroy();
        if ((ctx.sampleText.get(i) ?? "") !== text) return null;
      } finally {
        page.destroy();
      }
    }
    return out;
  } catch {
    return null;
  } finally {
    check?.destroy();
    doc?.destroy();
  }
}

/** Desglose rápido del documento de salida (imágenes, fuentes, contenido, metadatos). */
export function measureBreakdown(doc: PDFDocument, fileSize: number): SizeBreakdown {
  const walk = walkDocument(doc, doc.countPages());
  let images = 0;
  for (const ref of walk.images.values()) images += streamLength(ref.stream);
  let fonts = 0;
  const seen = new Set<number>();
  for (const f of walk.fonts.values()) {
    if (!f.embeddedFile) continue;
    const num = f.embeddedFile.isIndirect() ? f.embeddedFile.asIndirect() : -1;
    if (num >= 0 && seen.has(num)) continue;
    if (num >= 0) seen.add(num);
    fonts += streamLength(resolveDict(f.embeddedFile));
  }
  const root = resolveDict(get(doc.getTrailer(), "Root"));
  const metadata = streamLength(resolveDict(get(root, "Metadata")));
  const content = walk.contentBytes;
  return { images, fonts, content, metadata, other: Math.max(0, fileSize - images - fonts - content - metadata) };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
