/**
 * Decodifica imágenes PDF a RGBA plano usando MuPDF (maneja JPX, JBIG2, CCITT,
 * ICC, Indexed, Separation, Decode arrays…) y convierte de vuelta candidatos
 * codificados para verificar calidad.
 */
import type { Mu, PDFDocument, PDFObject, Pixmap } from "../mupdf";
import { createRgba, type RgbaImage } from "./types";

export interface Decoded {
  rgba: RgbaImage;
  /** true si la imagen se decodificó a gris (1 componente) */
  gray: boolean;
  /** Componentes de color del pixmap original (sin alfa) */
  sourceComponents: number;
}

/** Límite de píxeles para decodificar a RGBA en memoria (≈ 160 MB) */
export const MAX_DECODE_PIXELS = 40_000_000;

export function decodeImage(mupdf: Mu, doc: PDFDocument, ref: PDFObject, wantGray: boolean): Decoded | null {
  let image: ReturnType<PDFDocument["loadImage"]> | null = null;
  let pix: Pixmap | null = null;
  try {
    image = doc.loadImage(ref);
    const w = image.getWidth();
    const h = image.getHeight();
    if (w * h > MAX_DECODE_PIXELS) return null;
    pix = image.toPixmap();
    return pixmapToRgba(mupdf, pix, wantGray);
  } catch {
    return null;
  } finally {
    try {
      pix?.destroy();
    } catch {
      /* ignore */
    }
    try {
      image?.destroy();
    } catch {
      /* ignore */
    }
  }
}

/** Decodifica bytes de imagen (JPEG/PNG…) a RGBA — para verificar candidatos. */
export function decodeBytes(mupdf: Mu, bytes: Uint8Array, wantGray: boolean): Decoded | null {
  let image: InstanceType<Mu["Image"]> | null = null;
  let pix: Pixmap | null = null;
  try {
    image = new mupdf.Image(bytes);
    pix = image.toPixmap();
    return pixmapToRgba(mupdf, pix, wantGray);
  } catch {
    return null;
  } finally {
    try {
      pix?.destroy();
    } catch {
      /* ignore */
    }
    try {
      image?.destroy();
    } catch {
      /* ignore */
    }
  }
}

export function pixmapToRgba(mupdf: Mu, source: Pixmap, wantGray: boolean): Decoded {
  const alpha = source.getAlpha();
  const n = source.getNumberOfComponents();
  const colorComponents = Math.max(1, n - alpha);
  const target = wantGray || colorComponents === 1 ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB;
  const cs = source.getColorSpace();
  const needsConvert = !cs || cs.getNumberOfComponents() !== target.getNumberOfComponents() || alpha !== 0 || (target === mupdf.ColorSpace.DeviceGray ? !cs.isGray() : !cs.isRGB());

  let pix: Pixmap = source;
  let converted = false;
  if (needsConvert) {
    pix = source.convertToColorSpace(target, false);
    converted = true;
  }
  try {
    const w = pix.getWidth();
    const h = pix.getHeight();
    const stride = pix.getStride();
    const comps = pix.getNumberOfComponents();
    const px = pix.getPixels(); // vista viva sobre la memoria WASM: copiar ya
    const out = createRgba(w, h);
    const d = out.data;
    if (comps === 1) {
      for (let y = 0; y < h; y++) {
        let s = y * stride;
        let o = y * w * 4;
        for (let x = 0; x < w; x++) {
          const g = px[s++] ?? 0;
          d[o++] = g;
          d[o++] = g;
          d[o++] = g;
          d[o++] = 255;
        }
      }
    } else {
      for (let y = 0; y < h; y++) {
        let s = y * stride;
        let o = y * w * 4;
        for (let x = 0; x < w; x++) {
          d[o++] = px[s] ?? 0;
          d[o++] = px[s + 1] ?? 0;
          d[o++] = px[s + 2] ?? 0;
          d[o++] = 255;
          s += comps;
        }
      }
    }
    return { rgba: out, gray: comps === 1, sourceComponents: colorComponents };
  } finally {
    if (converted) {
      try {
        pix.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Reduce una imagen RGBA por muestreo de caja (rápido) hasta que el lado mayor ≤ maxSide. */
export function downscaleBox(img: RgbaImage, maxSide: number): RgbaImage {
  const f = Math.ceil(Math.max(img.width, img.height) / maxSide);
  if (f <= 1) return img;
  const w = Math.max(1, Math.floor(img.width / f));
  const h = Math.max(1, Math.floor(img.height / f));
  const out = createRgba(w, h);
  const src = img.data;
  const dst = out.data;
  const area = f * f;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = 0; yy < f; yy++) {
        let s = ((y * f + yy) * img.width + x * f) * 4;
        for (let xx = 0; xx < f; xx++) {
          r += src[s] ?? 0;
          g += src[s + 1] ?? 0;
          b += src[s + 2] ?? 0;
          s += 4;
        }
      }
      const o = (y * w + x) * 4;
      dst[o] = r / area;
      dst[o + 1] = g / area;
      dst[o + 2] = b / area;
      dst[o + 3] = 255;
    }
  }
  return out;
}
