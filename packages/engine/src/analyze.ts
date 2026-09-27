/**
 * Análisis estructural del PDF: inventario de imágenes con DPI efectivo,
 * fuentes, desglose de bytes, texto por página, interactividad y estimación
 * de ahorro por preset. Todo sin subir nada.
 */
import type { AnalysisReport, DocFeatures, DocType, ImageInfo, SizeBreakdown } from "@prensa/schema";
import { estimateAll } from "./estimate";
import { classifyCheap } from "./images/classify";
import { primaryFilter } from "./images/process";
import type { Mu, PDFDocument, PDFObject } from "./mupdf";
import { asBool, asName, asNumber, colorSpaceInfo, forEachEntry, get, has, resolveArray, resolveDict, streamLength } from "./pdf/objects";
import { measurePlacements, type PlacementMap } from "./pdf/placement";
import { walkDocument, type WalkResult } from "./pdf/walk";

export interface AnalysisContext {
  report: AnalysisReport;
  walk: WalkResult;
  placements: PlacementMap;
  imageInfos: Map<number, ImageInfo>;
  samplePages: number[];
  /** Texto normalizado por página de muestra (para verificar después) */
  sampleText: Map<number, string>;
  /** Cantidad de anotaciones por página de muestra */
  sampleAnnots: Map<number, number>;
}

export interface AnalyzeOptions {
  onProgress?: ((progress: number, message?: string) => void) | undefined;
  signal?: AbortSignal | undefined;
  /** Páginas de muestra para texto/verificación (máx.) */
  maxSamplePages?: number;
}

export function pickSamplePages(pageCount: number, max = 12): number[] {
  if (pageCount <= max) return Array.from({ length: pageCount }, (_, i) => i);
  const set = new Set<number>([0, pageCount - 1]);
  for (let i = 1; i < max - 1; i++) set.add(Math.round((i * (pageCount - 1)) / (max - 1)));
  return [...set].sort((a, b) => a - b);
}

export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function analyzeDocument(
  mupdf: Mu,
  doc: PDFDocument,
  fileName: string,
  fileSize: number,
  opts: AnalyzeOptions = {},
): AnalysisContext {
  const t0 = now();
  const progress = (p: number, m?: string) => opts.onProgress?.(p, m);
  const pageCount = doc.countPages();
  progress(0.05, "Leyendo estructura");

  const walk = walkDocument(doc, pageCount);
  progress(0.3, "Midiendo imágenes");
  const { placements, unmatched } = measurePlacements(mupdf, doc, walk.images, pageCount, (p) =>
    progress(0.3 + 0.35 * (p / Math.max(1, pageCount))),
  );

  // ── Imágenes ─────────────────────────────────────────────────────
  const imageInfos = new Map<number, ImageInfo>();
  let imageBytes = 0;
  for (const ref of walk.images.values()) {
    const s = ref.stream;
    const isMask = asBool(get(s, "ImageMask"));
    const width = asNumber(get(s, "Width"));
    const height = asNumber(get(s, "Height"));
    const bpc = asNumber(get(s, "BitsPerComponent"), isMask ? 1 : 8);
    const cs = colorSpaceInfo(get(s, "ColorSpace"));
    const filter = primaryFilter(s);
    const bytes = streamLength(s);
    const pl = placements.get(ref.objectNumber);
    const info: ImageInfo = {
      objectNumber: ref.objectNumber,
      width,
      height,
      bitsPerComponent: bpc,
      components: cs.family === "Unknown" && filter === "JPXDecode" ? 3 : cs.components,
      colorSpace: cs.family,
      filter,
      bytes,
      hasSoftMask: resolveDict(get(s, "SMask")) != null,
      isStencilMask: isMask,
      drawnWidthPt: pl ? round2(pl.maxWidthPt) : null,
      drawnHeightPt: pl ? round2(pl.maxHeightPt) : null,
      effectiveDpi: pl ? Math.round(pl.minDpi) : null,
      occurrences: pl ? pl.occurrences : ref.references,
      kind: classifyCheap({ width, height, bitsPerComponent: bpc, isStencilMask: isMask, bytes, filter }),
    };
    imageInfos.set(ref.objectNumber, info);
    imageBytes += bytes;
  }

  // ── Fuentes ──────────────────────────────────────────────────────
  let fontBytes = 0;
  let embedded = 0;
  let subset = 0;
  const seenFontFiles = new Set<number>();
  for (const f of walk.fonts.values()) {
    if (f.embeddedFile) {
      embedded++;
      const ff = f.embeddedFile;
      const num = ff.isIndirect() ? ff.asIndirect() : -1;
      if (num < 0 || !seenFontFiles.has(num)) {
        if (num >= 0) seenFontFiles.add(num);
        fontBytes += streamLength(resolveDict(ff));
      }
    }
    if (f.subset) subset++;
  }

  progress(0.7, "Detectando texto");
  // ── Texto por página de muestra ──────────────────────────────────
  const samplePages = pickSamplePages(pageCount, opts.maxSamplePages ?? 12);
  const sampleText = new Map<number, string>();
  const sampleAnnots = new Map<number, number>();
  let textPagesSample = 0;
  let imageOnlySample = 0;
  let landscape = 0;
  const pagesWithImages = new Set<number>();
  for (const ref of walk.images.values()) for (const p of ref.pages) pagesWithImages.add(p);
  for (const i of samplePages) {
    let text = "";
    try {
      const page = doc.loadPage(i);
      try {
        const st = page.toStructuredText("preserve-whitespace");
        text = normalizeText(st.asText());
        st.destroy();
        const [x0, y0, x1, y1] = page.getBounds();
        if (x1 - x0 > y1 - y0) landscape++;
        sampleAnnots.set(i, page.getAnnotations().length);
      } finally {
        page.destroy();
      }
    } catch {
      /* página ilegible */
    }
    sampleText.set(i, text);
    if (text.length > 20) textPagesSample++;
    else if (pagesWithImages.has(i)) imageOnlySample++;
  }
  const sampleN = Math.max(1, samplePages.length);
  const textPages = Math.round((textPagesSample / sampleN) * pageCount);
  const imageOnlyPages = Math.round((imageOnlySample / sampleN) * pageCount);

  progress(0.85, "Revisando interactividad");
  // ── Interactividad y extras ──────────────────────────────────────
  const features = detectFeatures(doc, pageCount, samplePages);

  // ── Desglose de bytes ────────────────────────────────────────────
  const root = resolveDict(get(doc.getTrailer(), "Root"));
  const metadataBytes = streamLength(resolveDict(get(root, "Metadata")));
  const content = walk.contentBytes;
  const accounted = imageBytes + fontBytes + content + metadataBytes;
  const breakdown: SizeBreakdown = {
    images: imageBytes,
    fonts: fontBytes,
    content,
    metadata: metadataBytes,
    other: Math.max(0, fileSize - accounted),
  };

  // ── Tipo de documento ────────────────────────────────────────────
  const docType = classifyDocument({
    pageCount,
    hasImages: walk.images.size > 0,
    textRatio: textPagesSample / sampleN,
    imageOnlyRatio: imageOnlySample / sampleN,
    imageByteRatio: fileSize > 0 ? imageBytes / fileSize : 0,
    landscapeRatio: landscape / sampleN,
    contentBytes: content,
  });

  const images = [...imageInfos.values()];
  const allFontsSubset = embedded > 0 && subset === embedded;
  const estimates = estimateAll(images, breakdown, fileSize, allFontsSubset, true);

  const warnings: string[] = [];
  if (features.signatures) warnings.push("El documento tiene firmas digitales: cualquier cambio las invalida.");
  if (features.encrypted) warnings.push("El documento está cifrado; se conservará el cifrado salvo que lo desactives.");
  if (unmatched > 0) warnings.push(`${unmatched} apariciones de imagen no se pudieron medir; se usará su tamaño nominal.`);
  try {
    if (doc.wasRepaired()) warnings.push("El archivo estaba dañado y fue reparado al abrirlo.");
  } catch {
    /* ignore */
  }

  const report: AnalysisReport = {
    fileName,
    fileSize,
    pageCount,
    pdfVersion: safeVersion(doc),
    docType,
    textPages,
    imageOnlyPages,
    images,
    fonts: { count: walk.fonts.size, embedded, subset, bytes: fontBytes },
    breakdown,
    features,
    estimates,
    warnings,
    durationMs: now() - t0,
  };
  progress(1, "Listo");
  return { report, walk, placements, imageInfos, samplePages, sampleText, sampleAnnots };
}

function safeVersion(doc: PDFDocument): string | null {
  try {
    const v = doc.getVersion();
    return `${Math.floor(v / 10)}.${v % 10}`;
  } catch {
    return null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

interface ClassifyDocInput {
  pageCount: number;
  hasImages: boolean;
  textRatio: number;
  imageOnlyRatio: number;
  imageByteRatio: number;
  landscapeRatio: number;
  contentBytes: number;
}

export function classifyDocument(i: ClassifyDocInput): DocType {
  if (i.pageCount === 0) return "empty";
  if (!i.hasImages) return i.textRatio > 0 ? "text" : i.contentBytes > 0 ? "vector" : "empty";
  if (i.imageOnlyRatio >= 0.8 && i.textRatio <= 0.2) return "scanned";
  if (i.textRatio === 0) return "image";
  if (i.landscapeRatio >= 0.8 && i.imageByteRatio > 0.3 && i.pageCount <= 300) return "presentation";
  if (i.imageByteRatio > 0.5) return "mixed";
  return "text";
}

export function detectFeatures(doc: PDFDocument, pageCount: number, samplePages: number[]): DocFeatures {
  const trailer = doc.getTrailer();
  const root = resolveDict(get(trailer, "Root"));
  const acro = resolveDict(get(root, "AcroForm"));
  const fields = resolveArray(get(acro, "Fields"));
  const forms = !!fields && fields.length > 0;
  let signatures = false;
  if (forms) {
    if (asNumber(get(acro, "SigFlags"), 0) > 0) signatures = true;
    else signatures = hasSignatureField(fields, 0);
  }

  const names = resolveDict(get(root, "Names"));
  let javascript = has(names, "JavaScript") || has(root, "AA");
  const openAction = resolveDict(get(root, "OpenAction"));
  if (openAction && asName(get(openAction, "S")) === "JavaScript") javascript = true;

  let links = false;
  let annotations = false;
  let attachments = has(names, "EmbeddedFiles");
  let pieceInfo = has(root, "PieceInfo");
  let thumbnails = false;
  // Recorremos hasta 400 páginas para flags de anotaciones (suficiente y rápido)
  const scanPages = pageCount <= 400 ? Array.from({ length: pageCount }, (_, i) => i) : samplePages;
  for (const i of scanPages) {
    let pageObj: PDFObject;
    try {
      pageObj = doc.findPage(i);
    } catch {
      continue;
    }
    if (has(pageObj, "Thumb")) thumbnails = true;
    if (has(pageObj, "PieceInfo")) pieceInfo = true;
    if (has(pageObj, "AA")) javascript = true;
    forEachEntry(resolveArray(get(pageObj, "Annots")), (a) => {
      const annot = resolveDict(a);
      const sub = asName(get(annot, "Subtype"));
      if (sub === "Link") links = true;
      else if (sub === "Widget") {
        /* formulario */
      } else if (sub === "FileAttachment") {
        attachments = true;
        annotations = true;
      } else if (sub) annotations = true;
      const action = resolveDict(get(annot, "A"));
      if (action && asName(get(action, "S")) === "JavaScript") javascript = true;
      if (has(annot, "AA")) javascript = true;
    });
  }

  const outlines = resolveDict(get(root, "Outlines"));
  const bookmarks = !!outlines && has(outlines, "First");
  const markInfo = resolveDict(get(root, "MarkInfo"));
  const tagged = has(root, "StructTreeRoot") || asBool(get(markInfo, "Marked"));
  let incrementalUpdates = 0;
  try {
    incrementalUpdates = Math.max(0, doc.countVersions() - 1);
  } catch {
    /* ignore */
  }

  return {
    forms,
    signatures,
    links,
    annotations,
    bookmarks,
    javascript,
    layers: has(root, "OCProperties"),
    attachments,
    tagged,
    pieceInfo,
    thumbnails,
    xmp: resolveDict(get(root, "Metadata")) != null,
    encrypted: has(trailer, "Encrypt"),
    incrementalUpdates,
  };
}

function hasSignatureField(fields: PDFObject | null, depth: number): boolean {
  if (!fields || depth > 4) return false;
  let found = false;
  let count = 0;
  forEachEntry(fields, (fref) => {
    if (found || count++ > 5000) return;
    const f = resolveDict(fref);
    if (!f) return;
    if (asName(get(f, "FT")) === "Sig" && has(f, "V")) found = true;
    else if (asName(get(f, "FT")) === "Sig") found = true;
    else if (hasSignatureField(resolveArray(get(f, "Kids")), depth + 1)) found = true;
  });
  return found;
}
