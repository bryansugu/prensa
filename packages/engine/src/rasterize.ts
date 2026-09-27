/**
 * Modo "Rasterizar": cada página se convierte en una imagen (JPEG, o 1 bpc si
 * se pide blanco y negro). Se pierde texto e interactividad — es la opción de
 * compresión extrema y de "aplanar todo".
 */
import type { CompressionSpec, PresetDefinition } from "@prensa/schema";
import { encodeJpeg } from "./codecs";
import { deflate, sauvolaBilevel, toGray8 } from "./images/encode";
import { pixmapToRgba } from "./images/pixels";
import type { Mu, PDFDocument } from "./mupdf";

export interface RasterizeOptions {
  onPage?: ((index: number, total: number) => void) | undefined;
  signal?: AbortSignal | undefined;
}

export async function rasterizeDocument(
  mupdf: Mu,
  doc: PDFDocument,
  spec: CompressionSpec,
  params: PresetDefinition,
  opts: RasterizeOptions = {},
): Promise<Uint8Array> {
  const dpi = params.colorDpi ?? 150;
  const quality = params.photoQuality ?? 85;
  const gray = spec.images.color !== "keep";
  const bilevel = spec.images.color === "bilevel";
  const out = new mupdf.PDFDocument();
  const total = doc.countPages();
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    opts.onPage?.(i, total);
    const page = doc.loadPage(i);
    try {
      const bounds = page.getBounds();
      const [x0, y0, x1, y1] = bounds;
      const wPt = x1 - x0;
      const hPt = y1 - y0;
      const scale = (bilevel ? Math.max(dpi, params.monoDpi ?? 300) : dpi) / 72;
      const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), gray ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB, false, true);
      let imageRef;
      try {
        const rgba = pixmapToRgba(mupdf, pix, gray).rgba;
        if (bilevel) {
          const g = toGray8(rgba, true);
          const packed = sauvolaBilevel(g, rgba.width, rgba.height);
          imageRef = out.addRawStream(deflate(packed), {
            Type: out.newName("XObject"),
            Subtype: out.newName("Image"),
            Width: rgba.width,
            Height: rgba.height,
            ColorSpace: out.newName("DeviceGray"),
            BitsPerComponent: 1,
            Filter: out.newName("FlateDecode"),
          });
        } else {
          const jpeg = await encodeJpeg(rgba, { quality, grayscale: gray, chromaSubsample: params.chroma === "420" ? 2 : 1 });
          imageRef = out.addRawStream(jpeg, {
            Type: out.newName("XObject"),
            Subtype: out.newName("Image"),
            Width: rgba.width,
            Height: rgba.height,
            ColorSpace: out.newName(gray ? "DeviceGray" : "DeviceRGB"),
            BitsPerComponent: 8,
            Filter: out.newName("DCTDecode"),
          });
        }
      } finally {
        pix.destroy();
      }
      const contents = `q ${fmt(wPt)} 0 0 ${fmt(hPt)} 0 0 cm /Im0 Do Q`;
      const pageObj = out.addPage([0, 0, wPt, hPt], 0, { XObject: { Im0: imageRef } }, contents);
      out.insertPage(-1, pageObj);
    } finally {
      page.destroy();
    }
  }
  const buf = out.saveToBuffer("garbage=deduplicate,compress,objstms");
  try {
    return new Uint8Array(buf.asUint8Array());
  } finally {
    buf.destroy();
    out.destroy();
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}
