/** Estimación de tamaño por preset a partir del inventario del análisis (sin comprimir). */
import { PRESETS, type ImageInfo, type PresetEstimate, type PresetId, type SizeBreakdown } from "@prensa/schema";

/** Bits por píxel típicos de un JPEG 4:2:0 de foto según calidad mozjpeg. */
export function bitsPerPixelForQuality(q: number): number {
  const table: Array<[number, number]> = [
    [30, 0.4],
    [50, 0.55],
    [62, 0.75],
    [75, 1.05],
    [85, 1.55],
    [92, 2.3],
    [95, 3.0],
    [100, 5.0],
  ];
  if (q <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [q1, b1] = table[i]!;
    const [q0, b0] = table[i - 1]!;
    if (q <= q1) return b0 + ((q - q0) / (q1 - q0)) * (b1 - b0);
  }
  return table[table.length - 1]![1];
}

const LOSSLESS_FILTERS = new Set([null, "FlateDecode", "LZWDecode", "RunLengthDecode", "ASCIIHexDecode", "ASCII85Decode"]);

export function estimateImage(img: ImageInfo, preset: PresetId, threshold = 1.15): number {
  const p = PRESETS[preset];
  if (img.kind === "mask" || img.kind === "tiny") return img.bytes;
  const dpi = img.effectiveDpi;
  if (img.kind === "bilevel") {
    if (p.monoDpi && dpi && dpi > p.monoDpi * threshold) {
      const s = p.monoDpi / dpi;
      return Math.round(img.bytes * s * s);
    }
    return img.bytes;
  }
  if (p.photoQuality == null) {
    // Sin pérdida: solo mejora lo que estaba mal comprimido.
    return LOSSLESS_FILTERS.has(img.filter) ? Math.round(img.bytes * 0.8) : img.bytes;
  }
  let scale = 1;
  if (p.colorDpi && dpi && dpi > p.colorDpi * threshold) {
    const s = p.colorDpi / dpi;
    scale = s * s;
  }
  const pixels = img.width * img.height * scale;
  const gray = img.components === 1 && img.colorSpace !== "Indexed";
  let bpp: number;
  if (img.kind === "graphic") bpp = 1.0;
  else bpp = bitsPerPixelForQuality(p.photoQuality) * (gray ? 0.6 : 1) * (p.chroma === "444" ? 1.25 : 1);
  const est = Math.round((pixels * bpp) / 8) + 200;
  return Math.min(img.bytes, est);
}

export function estimateAll(
  images: ImageInfo[],
  breakdown: SizeBreakdown,
  fileSize: number,
  allFontsSubset: boolean,
  removesMetadata: boolean,
): Record<PresetId, PresetEstimate> {
  const out = {} as Record<PresetId, PresetEstimate>;
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    let imagesAfter = 0;
    for (const img of images) imagesAfter += estimateImage(img, id);
    const fontsAfter = Math.round(breakdown.fonts * (allFontsSubset ? 0.97 : 0.85));
    const contentAfter = Math.round(breakdown.content * 0.92);
    const metaAfter = removesMetadata ? 0 : breakdown.metadata;
    const otherAfter = Math.round(breakdown.other * 0.93);
    const total = Math.min(fileSize, imagesAfter + fontsAfter + contentAfter + metaAfter + otherAfter);
    out[id] = { bytes: total, savings: fileSize > 0 ? Math.max(0, Math.min(0.98, 1 - total / fileSize)) : 0 };
  }
  return out;
}
