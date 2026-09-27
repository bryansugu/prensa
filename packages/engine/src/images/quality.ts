/** Métrica perceptual (SSIM sobre luma) para garantizar la calidad de cada imagen. */
import { ssim } from "ssim.js";
import { downscaleBox } from "./pixels";
import type { RgbaImage } from "./types";

const MAX_SIDE = 512;

/**
 * SSIM medio entre referencia y candidato (mismas dimensiones). Se reduce a
 * ≤512 px de lado para que el costo sea despreciable frente a la codificación.
 * 1 = idéntico. Devuelve NaN si no se puede comparar.
 */
export function ssimScore(reference: RgbaImage, candidate: RgbaImage): number {
  if (reference.width !== candidate.width || reference.height !== candidate.height) return NaN;
  const a = downscaleBox(reference, MAX_SIDE);
  const b = downscaleBox(candidate, MAX_SIDE);
  if (a.width < 8 || a.height < 8) return 1;
  try {
    const r = ssim(a, b, {
      ssim: "bezkrovny",
      downsample: false,
    });
    return r.mssim;
  } catch {
    return NaN;
  }
}
