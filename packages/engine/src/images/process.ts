/**
 * Pipeline por imagen: decodificar → clasificar → redimensionar al DPI
 * efectivo objetivo → codificar candidatos → verificar SSIM → escribir
 * in-place solo si ahorra bytes. Nunca reescribe el documento: enlaces,
 * formularios y anotaciones quedan intactos.
 */
import type { CompressionSpec, ImageInfo, PresetDefinition } from "@prensa/schema";
import { encodeJpeg, resizeRgba } from "../codecs";
import type { Mu, PDFDocument, PDFObject } from "../mupdf";
import { asName, asNumber, get, isStreamRef, objectNumber, resolveArray } from "../pdf/objects";
import type { Placement } from "../pdf/placement";
import type { ImageRef } from "../pdf/walk";
import { classify, computeStats } from "./classify";
import { deflate, isEffectivelyBilevel, packBilevel, quantizeExact, sauvolaBilevel, toGray8 } from "./encode";
import { decodeBytes, decodeImage } from "./pixels";
import { ssimScore } from "./quality";
import type { RgbaImage } from "./types";

export interface ProcessContext {
  mupdf: Mu;
  doc: PDFDocument;
  params: PresetDefinition;
  spec: CompressionSpec;
  signal?: AbortSignal | undefined;
}

export type ImageAction = "kept" | "recompressed" | "downsampled" | "skipped";

export interface ImageOutcome {
  objectNumber: number;
  action: ImageAction;
  reason?: string;
  beforeBytes: number;
  afterBytes: number;
  ssim: number | null;
  width: number;
  height: number;
  codec?: "jpeg" | "indexed" | "gray" | "bilevel";
}

/** Solo reemplazamos si ahorra al menos este porcentaje (evita churn inútil). */
const MIN_GAIN = 0.03;
/** Aumentos de calidad al no alcanzar el SSIM mínimo. */
const QUALITY_STEP = 6;
const QUALITY_MAX = 95;

interface Candidate {
  codec: "jpeg" | "indexed" | "gray" | "bilevel";
  bytes: Uint8Array;
  ssim: number | null;
  write: () => void;
}

export async function processImage(
  ctx: ProcessContext,
  ref: ImageRef,
  info: ImageInfo,
  placement: Placement | undefined,
): Promise<ImageOutcome> {
  const { mupdf, doc, params, spec } = ctx;
  const stream = ref.stream; // lectura de claves
  const target = ref.ref; // escritura (stream + diccionario) vía referencia indirecta
  const base: ImageOutcome = {
    objectNumber: ref.objectNumber,
    action: "kept",
    beforeBytes: info.bytes,
    afterBytes: info.bytes,
    ssim: null,
    width: info.width,
    height: info.height,
  };

  // ── Casos que no tocamos ─────────────────────────────────────────
  if (info.isStencilMask) return { ...base, action: "skipped", reason: "stencil" };
  if (info.kind === "tiny") return { ...base, action: "skipped", reason: "tiny" };
  const maskEntry = get(stream, "Mask");
  if (maskEntry && resolveArray(maskEntry)) return { ...base, action: "skipped", reason: "color-key-mask" };
  if (asNumber(get(stream, "SMaskInData"), 0) > 0) return { ...base, action: "skipped", reason: "smask-in-data" };
  const isLossless = params.photoQuality == null;

  // Imágenes bilevel: solo se reducen si superan el DPI mono (Fase 2 añade JBIG2 en nube).
  if (info.kind === "bilevel") {
    return await processBilevel(ctx, ref, info, placement, base);
  }

  const wantGray = spec.images.color !== "keep" || (info.components === 1 && info.colorSpace !== "Indexed");
  const decoded = decodeImage(mupdf, doc, ref.ref, wantGray);
  if (!decoded) return { ...base, action: "skipped", reason: "undecodable-or-huge" };
  let rgba = decoded.rgba;
  const gray = decoded.gray;

  // ── Clasificación sobre la imagen original ───────────────────────
  const stats = computeStats(rgba);
  const kind = classify({
    width: rgba.width,
    height: rgba.height,
    bitsPerComponent: info.bitsPerComponent,
    isStencilMask: false,
    bytes: info.bytes,
    filter: info.filter,
    stats,
  });
  // Paleta exacta calculada ANTES de redimensionar: un gráfico plano se
  // representa sin pérdida con ≤256 colores; el remuestreo crearía tonos
  // intermedios que romperían esa propiedad.
  const exactPalette = !gray && (kind === "graphic" || isLossless) ? quantizeExact(rgba, 256) : null;

  // ── Redimensionado al DPI efectivo ───────────────────────────────
  let downsampled = false;
  const dpiTarget = params.colorDpi;
  if (dpiTarget && placement && placement.minDpi > dpiTarget * spec.images.downsampleThreshold) {
    const scale = dpiTarget / placement.minDpi;
    const targetW = Math.max(1, Math.round(rgba.width * scale));
    const targetH = Math.max(1, Math.round(rgba.height * scale));
    if (targetW < rgba.width || targetH < rgba.height) {
      rgba = await resizeRgba(rgba, targetW, targetH);
      if (exactPalette) remapToPalette(rgba, exactPalette.palette);
      downsampled = true;
    }
  }
  throwIfAborted(ctx.signal);

  const candidates: Candidate[] = [];
  const writeCommon = (bytes: Uint8Array, filter: string, colorSpace: PDFObject, bpc: number) => {
    target.writeRawStream(bytes);
    target.put("Filter", doc.newName(filter));
    target.put("Width", rgba.width);
    target.put("Height", rgba.height);
    target.put("BitsPerComponent", bpc);
    target.put("ColorSpace", colorSpace);
    for (const k of ["DecodeParms", "Decode", "Alternates", "OPI", "Metadata", "ColorTransform"]) {
      try {
        target.delete(k);
      } catch {
        /* no existía */
      }
    }
  };

  // Blanco y negro adaptativo (Sauvola). Forzado si el usuario eligió B/N o
  // scan.bilevel=force; automático solo en escaneos que ya son casi bilevel.
  const bilevelMode = spec.scan.bilevel;
  const forceBilevel = spec.images.color === "bilevel" || bilevelMode === "force";
  let autoBilevel = false;
  if (!forceBilevel && bilevelMode === "auto" && kind === "scan") {
    autoBilevel = isEffectivelyBilevel(toGray8(rgba, gray), 40);
  }
  if (forceBilevel || autoBilevel) {
    const g = toGray8(rgba, gray);
    const packed = sauvolaBilevel(g, rgba.width, rgba.height);
    // Para comparar tamaños usamos Flate; al guardar, MuPDF re-codifica los
    // streams bilevel sin filtro como CCITT G4 (opción "compress"), aún más chico.
    const bytes = deflate(packed);
    candidates.push({
      codec: "bilevel",
      bytes,
      ssim: null,
      write: () => {
        target.writeStream(packed); // sin filtro → CCITT al guardar
        target.put("Width", rgba.width);
        target.put("Height", rgba.height);
        target.put("BitsPerComponent", 1);
        target.put("ColorSpace", doc.newName("DeviceGray"));
        for (const k of ["DecodeParms", "Decode", "Alternates", "OPI", "Metadata", "ColorTransform", "SMask", "Mask"]) {
          try {
            target.delete(k);
          } catch {
            /* no existía */
          }
        }
      },
    });
  }

  // Paleta exacta (gráficos planos): sin pérdida, suele ganar por mucho a JPEG.
  if (!forceBilevel && (kind === "graphic" || isLossless || exactPalette)) {
    if (gray) {
      const g = toGray8(rgba, true);
      const bytes = deflate(g);
      candidates.push({
        codec: "gray",
        bytes,
        ssim: 1,
        write: () => writeCommon(bytes, "FlateDecode", doc.newName("DeviceGray"), 8),
      });
    } else {
      const q = quantizeExact(rgba, 256);
      if (q) {
        const bytes = deflate(q.indices);
        candidates.push({
          codec: "indexed",
          bytes,
          ssim: 1,
          write: () => {
            const cs = doc.newArray();
            cs.push(doc.newName("Indexed"));
            cs.push(doc.newName("DeviceRGB"));
            cs.push(q.colors - 1);
            cs.push(doc.newByteString(q.palette));
            writeCommon(bytes, "FlateDecode", cs, 8);
          },
        });
      }
    }
  }

  // JPEG (mozjpeg) con garantía de SSIM.
  if (!isLossless && !forceBilevel) {
    const baseQuality = kind === "graphic" ? params.graphicQuality ?? 82 : params.photoQuality ?? 75;
    const scanAdjust = kind === "scan" ? -5 : 0;
    let quality = clamp(baseQuality + scanAdjust, 20, QUALITY_MAX);
    const chroma: 1 | 2 = params.chroma === "420" && kind === "photo" && Math.min(rgba.width, rgba.height) >= 600 ? 2 : 1;
    const minSsim = params.minSsim;
    for (let attempt = 0; attempt < 5; attempt++) {
      throwIfAborted(ctx.signal);
      const bytes = await encodeJpeg(rgba, { quality, grayscale: gray, chromaSubsample: chroma });
      if (bytes.length >= info.bytes * (1 - MIN_GAIN) && !downsampled) break; // no va a ganar
      const back = decodeBytes(mupdf, bytes, gray);
      const score = back ? ssimScore(rgba, back.rgba) : NaN;
      const ok = Number.isNaN(score) ? attempt > 0 : score >= minSsim;
      if (ok || quality >= QUALITY_MAX) {
        if (!Number.isNaN(score) && score < minSsim && quality >= QUALITY_MAX) break; // ni a 95 alcanza: conservar
        candidates.push({
          codec: "jpeg",
          bytes,
          ssim: Number.isNaN(score) ? null : score,
          write: () => writeCommon(bytes, "DCTDecode", doc.newName(gray ? "DeviceGray" : "DeviceRGB"), 8),
        });
        break;
      }
      quality = Math.min(QUALITY_MAX, quality + QUALITY_STEP);
    }
  }

  if (candidates.length === 0) return { ...base, action: "kept", reason: "no-candidates" };
  candidates.sort((a, b) => a.bytes.length - b.bytes.length);
  const best = candidates[0]!;
  const threshold = downsampled ? info.bytes : info.bytes * (1 - MIN_GAIN);
  if (best.bytes.length >= threshold) return { ...base, action: "kept", reason: "not-smaller" };

  // ── Escribir base y, si hace falta, la máscara suave al mismo tamaño ──
  best.write();
  if (info.hasSoftMask) {
    const smaskRef = get(stream, "SMask");
    if (smaskRef && downsampled) {
      const ok = rewriteSoftMask(ctx, smaskRef, rgba.width, rgba.height);
      if (!ok) {
        // No pudimos adaptar la máscara: dejarla como está (los visores escalan).
      }
    }
  }

  return {
    objectNumber: ref.objectNumber,
    action: downsampled ? "downsampled" : "recompressed",
    beforeBytes: info.bytes,
    afterBytes: best.bytes.length,
    ssim: best.ssim,
    width: rgba.width,
    height: rgba.height,
    codec: best.codec,
  };
}

async function processBilevel(
  ctx: ProcessContext,
  ref: ImageRef,
  info: ImageInfo,
  placement: Placement | undefined,
  base: ImageOutcome,
): Promise<ImageOutcome> {
  const { mupdf, doc, params, spec } = ctx;
  const monoDpi = params.monoDpi;
  if (!monoDpi || !placement || placement.minDpi <= monoDpi * spec.images.downsampleThreshold) {
    return { ...base, action: "kept", reason: "bilevel-keep" };
  }
  const decoded = decodeImage(mupdf, doc, ref.ref, true);
  if (!decoded) return { ...base, action: "skipped", reason: "undecodable-or-huge" };
  const scale = monoDpi / placement.minDpi;
  const w = Math.max(1, Math.round(decoded.rgba.width * scale));
  const h = Math.max(1, Math.round(decoded.rgba.height * scale));
  const resized = await resizeRgba(decoded.rgba, w, h);
  const g = toGray8(resized, true);
  const packed = packBilevel(g, w, h, 140);
  const bytes = deflate(packed);
  if (bytes.length >= info.bytes) return { ...base, action: "kept", reason: "not-smaller" };
  ref.ref.writeRawStream(bytes);
  ref.ref.put("Filter", doc.newName("FlateDecode"));
  ref.ref.put("Width", w);
  ref.ref.put("Height", h);
  ref.ref.put("BitsPerComponent", 1);
  ref.ref.put("ColorSpace", doc.newName("DeviceGray"));
  for (const k of ["DecodeParms", "Decode"]) {
    try {
      ref.ref.delete(k);
    } catch {
      /* ignore */
    }
  }
  return { ...base, action: "downsampled", afterBytes: bytes.length, width: w, height: h, codec: "bilevel" };
}

/** Redimensiona la /SMask al tamaño de la imagen base y la guarda en gris 8 bits Flate. */
function rewriteSoftMask(ctx: ProcessContext, smaskRef: PDFObject, width: number, height: number): boolean {
  const { mupdf, doc } = ctx;
  if (!isStreamRef(smaskRef) || objectNumber(smaskRef) == null) return false;
  const smask = smaskRef;
  const decoded = decodeImage(mupdf, doc, smaskRef, true);
  if (!decoded) return false;
  // resizeRgba es async; para la máscara usamos reducción por caja sincrónica
  // (suficiente: las máscaras suaves toleran bien el promedio).
  const resized = boxResizeGray(toGray8(decoded.rgba, true), decoded.rgba.width, decoded.rgba.height, width, height);
  const bytes = deflate(resized);
  smask.writeRawStream(bytes);
  smask.put("Filter", doc.newName("FlateDecode"));
  smask.put("Width", width);
  smask.put("Height", height);
  smask.put("BitsPerComponent", 8);
  smask.put("ColorSpace", doc.newName("DeviceGray"));
  for (const k of ["DecodeParms", "Decode", "Matte"]) {
    try {
      smask.delete(k);
    } catch {
      /* ignore */
    }
  }
  return true;
}

function boxResizeGray(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += src[yy * sw + xx] ?? 0;
          n++;
        }
      }
      out[y * dw + x] = n ? sum / n : 0;
    }
  }
  return out;
}

/** Sustituye cada píxel por el color más cercano de la paleta (vuelve exacta una imagen remuestreada). */
function remapToPalette(img: RgbaImage, palette: Uint8Array): void {
  const n = palette.length / 3;
  const cache = new Map<number, number>();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] ?? 0;
    const g = d[i + 1] ?? 0;
    const b = d[i + 2] ?? 0;
    const key = (r << 16) | (g << 8) | b;
    let best = cache.get(key);
    if (best === undefined) {
      let bestDist = Infinity;
      best = 0;
      for (let p = 0; p < n; p++) {
        const dr = r - (palette[p * 3] ?? 0);
        const dg = g - (palette[p * 3 + 1] ?? 0);
        const db = b - (palette[p * 3 + 2] ?? 0);
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
      if (cache.size < 65_536) cache.set(key, best);
    }
    d[i] = palette[best * 3] ?? 0;
    d[i + 1] = palette[best * 3 + 1] ?? 0;
    d[i + 2] = palette[best * 3 + 2] ?? 0;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
}

/** Nombre del filtro final (último de la cadena) o null. */
export function primaryFilter(stream: PDFObject): string | null {
  const f = get(stream, "Filter");
  if (!f) return null;
  const n = asName(f);
  if (n) return n;
  const arr = resolveArray(f);
  if (!arr) return null;
  let last: string | null = null;
  for (let i = 0; i < arr.length; i++) last = asName(get(arr, i)) ?? last;
  return last;
}

export type { RgbaImage };
