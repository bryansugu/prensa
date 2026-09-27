/**
 * Clasificación de imágenes por contenido: decide el códec y los parámetros.
 * Muestrea ~65k píxeles para ser rápida incluso en imágenes enormes.
 */
import type { ImageKind } from "@prensa/schema";
import type { RgbaImage } from "./types";

export interface ImageStats {
  /** Colores únicos (tope 4097 = "muchos") */
  uniqueColors: number;
  /** Fracción de píxeles con borde fuerte respecto al vecino derecho */
  edgeFraction: number;
  /** Fracción de píxeles casi neutros (r≈g≈b) */
  grayFraction: number;
  /** Histograma de luma en 3 bandas (oscuro / medio / claro) */
  darkFraction: number;
  midFraction: number;
  lightFraction: number;
}

export function computeStats(img: RgbaImage, sampleTarget = 65_536): ImageStats {
  const { data, width, height } = img;
  const total = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / sampleTarget)));
  const colors = new Set<number>();
  let samples = 0;
  let edges = 0;
  let grays = 0;
  let dark = 0;
  let mid = 0;
  let light = 0;
  let manyColors = false;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      samples++;
      if (!manyColors) {
        colors.add((r << 16) | (g << 8) | b);
        if (colors.size > 4096) manyColors = true;
      }
      if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) grays++;
      const luma = (r * 299 + g * 587 + b * 114) / 1000;
      if (luma < 64) dark++;
      else if (luma > 192) light++;
      else mid++;
      if (x + step < width) {
        const j = i + step * 4;
        const dr = Math.abs(r - (data[j] ?? 0));
        const dg = Math.abs(g - (data[j + 1] ?? 0));
        const db = Math.abs(b - (data[j + 2] ?? 0));
        if (dr + dg + db > 96) edges++;
      }
    }
  }
  const s = Math.max(1, samples);
  return {
    uniqueColors: manyColors ? 4097 : colors.size,
    edgeFraction: edges / s,
    grayFraction: grays / s,
    darkFraction: dark / s,
    midFraction: mid / s,
    lightFraction: light / s,
  };
}

export interface ClassifyInput {
  width: number;
  height: number;
  bitsPerComponent: number;
  isStencilMask: boolean;
  bytes: number;
  filter: string | null;
  stats?: ImageStats;
}

export const TINY_PIXELS = 64 * 64;
export const TINY_BYTES = 4096;

/** Clasificación barata (sin decodificar) usada por el análisis. */
export function classifyCheap(input: ClassifyInput): ImageKind {
  if (input.isStencilMask) return "mask";
  if (input.bitsPerComponent === 1 || input.filter === "CCITTFaxDecode" || input.filter === "JBIG2Decode") return "bilevel";
  if (input.width * input.height < TINY_PIXELS || input.bytes < TINY_BYTES) return "tiny";
  if (input.filter === "DCTDecode" || input.filter === "JPXDecode") return "photo";
  if (input.bitsPerComponent < 8) return "graphic";
  return "unknown";
}

/** Clasificación completa con estadísticas de píxeles. */
export function classify(input: ClassifyInput): ImageKind {
  const cheap = classifyCheap(input);
  if (cheap === "mask" || cheap === "bilevel" || cheap === "tiny") return cheap;
  const st = input.stats;
  if (!st) return cheap === "unknown" ? "photo" : cheap;
  if (st.uniqueColors <= 256) return "graphic";
  if (st.edgeFraction > 0.22 && st.uniqueColors <= 4096) return "graphic";
  const bimodal = st.midFraction < 0.12 && st.lightFraction > 0.55 && st.darkFraction > 0.02;
  if (st.grayFraction > 0.97 && bimodal && Math.min(input.width, input.height) >= 800) return "scan";
  return "photo";
}
