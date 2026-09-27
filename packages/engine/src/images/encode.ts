/** Codificadores sin pérdida y utilidades de empaquetado para PDF. */
import { zlibSync } from "fflate";
import type { RgbaImage } from "./types";

export function deflate(data: Uint8Array): Uint8Array {
  return zlibSync(data, { level: 9, mem: 12 });
}

export interface IndexedImage {
  indices: Uint8Array;
  /** RGB intercalado, 3 bytes por entrada */
  palette: Uint8Array;
  colors: number;
}

/** Paleta exacta (≤ maxColors colores). null si la imagen tiene más colores. */
export function quantizeExact(img: RgbaImage, maxColors = 256): IndexedImage | null {
  const { data, width, height } = img;
  const total = width * height;
  const map = new Map<number, number>();
  const indices = new Uint8Array(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const key = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
    let idx = map.get(key);
    if (idx === undefined) {
      if (map.size >= maxColors) return null;
      idx = map.size;
      map.set(key, idx);
    }
    indices[p] = idx;
  }
  const palette = new Uint8Array(map.size * 3);
  for (const [key, idx] of map) {
    palette[idx * 3] = (key >> 16) & 255;
    palette[idx * 3 + 1] = (key >> 8) & 255;
    palette[idx * 3 + 2] = key & 255;
  }
  return { indices, palette, colors: map.size };
}

/** Luma 8 bits (BT.601) de una RGBA. Si ya es gris, devuelve el canal R. */
export function toGray8(img: RgbaImage, alreadyGray: boolean): Uint8Array {
  const { data, width, height } = img;
  const out = new Uint8Array(width * height);
  if (alreadyGray) {
    for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = data[i] ?? 0;
    return out;
  }
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    out[p] = ((data[i] ?? 0) * 299 + (data[i + 1] ?? 0) * 587 + (data[i + 2] ?? 0) * 114 + 500) / 1000;
  }
  return out;
}

/** ¿Todos los píxeles son (casi) blanco o negro? */
export function isEffectivelyBilevel(gray: Uint8Array, tolerance = 24): boolean {
  const stride = Math.max(1, Math.floor(gray.length / 100_000));
  for (let i = 0; i < gray.length; i += stride) {
    const v = gray[i] ?? 0;
    if (v > tolerance && v < 255 - tolerance) return false;
  }
  return true;
}

/**
 * Empaqueta gris 8 bits a 1 bpc (DeviceGray, 1 = blanco) con umbral fijo.
 * Las filas se rellenan a byte completo como exige PDF.
 */
export function packBilevel(gray: Uint8Array, width: number, height: number, threshold = 128): Uint8Array {
  const rowBytes = (width + 7) >> 3;
  const out = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowIn = y * width;
    const rowOut = y * rowBytes;
    for (let x = 0; x < width; x++) {
      if ((gray[rowIn + x] ?? 0) >= threshold) {
        const o = rowOut + (x >> 3);
        out[o] = (out[o] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return out;
}

/**
 * Umbral adaptativo de Sauvola (para escaneos de texto con iluminación
 * desigual). Devuelve 1 bpc empaquetado.
 */
export function sauvolaBilevel(gray: Uint8Array, width: number, height: number, window = 31, k = 0.3): Uint8Array {
  const half = window >> 1;
  // Imágenes integrales (suma y suma de cuadrados) con una fila/columna extra.
  const W = width + 1;
  const integral = new Float64Array(W * (height + 1));
  const integralSq = new Float64Array(W * (height + 1));
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    let rowSq = 0;
    for (let x = 1; x <= width; x++) {
      const v = gray[(y - 1) * width + (x - 1)] ?? 0;
      rowSum += v;
      rowSq += v * v;
      integral[y * W + x] = (integral[(y - 1) * W + x] ?? 0) + rowSum;
      integralSq[y * W + x] = (integralSq[(y - 1) * W + x] ?? 0) + rowSq;
    }
  }
  const rowBytes = (width + 7) >> 3;
  const out = new Uint8Array(rowBytes * height);
  const R = 128;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width, x + half + 1);
      const area = (y1 - y0) * (x1 - x0);
      const sum =
        (integral[y1 * W + x1] ?? 0) - (integral[y0 * W + x1] ?? 0) - (integral[y1 * W + x0] ?? 0) + (integral[y0 * W + x0] ?? 0);
      const sq =
        (integralSq[y1 * W + x1] ?? 0) -
        (integralSq[y0 * W + x1] ?? 0) -
        (integralSq[y1 * W + x0] ?? 0) +
        (integralSq[y0 * W + x0] ?? 0);
      const mean = sum / area;
      const variance = Math.max(0, sq / area - mean * mean);
      const std = Math.sqrt(variance);
      const t = mean * (1 + k * (std / R - 1));
      if ((gray[y * width + x] ?? 0) > t) {
        const o = y * rowBytes + (x >> 3);
        out[o] = (out[o] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return out;
}
