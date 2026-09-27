/**
 * Generador de PDFs sintéticos para tests y benchmark: fotos (gradiente +
 * ruido), gráficos planos, texto, enlaces, marcadores. Todo con MuPDF.
 */
import type { Mu } from "../src/mupdf";
import { createRgba, type RgbaImage } from "../src/images/types";

export function makePhoto(width: number, height: number, seed = 7): RgbaImage {
  const img = createRgba(width, height);
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const d = img.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const fx = x / width;
      const fy = y / height;
      const wave = Math.sin(fx * 12 + fy * 5) * 0.5 + 0.5;
      d[i] = 40 + 180 * fx + 20 * wave + (rnd() - 0.5) * 24;
      d[i + 1] = 60 + 150 * fy + 30 * wave + (rnd() - 0.5) * 24;
      d[i + 2] = 200 - 120 * fx * fy + (rnd() - 0.5) * 24;
      d[i + 3] = 255;
    }
  }
  return img;
}

export function makeGraphic(width: number, height: number): RgbaImage {
  const img = createRgba(width, height);
  const palette = [
    [0, 146, 46],
    [255, 255, 255],
    [30, 31, 36],
    [255, 210, 0],
    [98, 99, 108],
  ];
  const d = img.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const cell = (Math.floor(x / 40) + Math.floor(y / 40)) % palette.length;
      const c = palette[cell]!;
      d[i] = c[0]!;
      d[i + 1] = c[1]!;
      d[i + 2] = c[2]!;
      d[i + 3] = 255;
    }
  }
  return img;
}

export function makeScan(width: number, height: number): RgbaImage {
  // Página "escaneada": fondo casi blanco con ruido leve y líneas de "texto" negras.
  const img = createRgba(width, height);
  const d = img.data;
  let s = 3;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let v = 235 + rnd() * 20;
      const line = Math.floor(y / 28);
      const inLine = y % 28 > 8 && y % 28 < 20;
      const inWord = Math.floor(x / 12) % 3 !== 0 && x > 60 && x < width - 60;
      if (inLine && inWord && line % 2 === 0 && rnd() > 0.15) v = 20 + rnd() * 40;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  return img;
}

export interface FixtureImage {
  rgba: RgbaImage;
  /** posición y tamaño en puntos */
  x: number;
  y: number;
  w: number;
  h: number;
  /** "jpeg" (calidad) o "png" (sin pérdida) */
  encoding: { type: "jpeg"; quality: number } | { type: "png" };
  name?: string;
}

export interface FixturePage {
  width?: number;
  height?: number;
  images?: FixtureImage[];
  text?: string[];
  link?: { x: number; y: number; w: number; h: number; uri: string };
}

export function rgbaToImage(mupdf: Mu, rgba: RgbaImage, encoding: FixtureImage["encoding"]) {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, rgba.width, rgba.height], false);
  try {
    const px = pix.getPixels();
    const stride = pix.getStride();
    for (let y = 0; y < rgba.height; y++) {
      for (let x = 0; x < rgba.width; x++) {
        const s = (y * rgba.width + x) * 4;
        const o = y * stride + x * 3;
        px[o] = rgba.data[s]!;
        px[o + 1] = rgba.data[s + 1]!;
        px[o + 2] = rgba.data[s + 2]!;
      }
    }
    const bytes = encoding.type === "jpeg" ? pix.asJPEG(encoding.quality, false) : pix.asPNG();
    return new mupdf.Image(bytes);
  } finally {
    pix.destroy();
  }
}

export function buildPdf(mupdf: Mu, pages: FixturePage[], opts: { outline?: boolean; metadata?: boolean } = {}): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
  const imageRefs = new Map<RgbaImage, ReturnType<Mu["PDFDocument"]["prototype"]["addImage"]>>();
  pages.forEach((p, index) => {
    const W = p.width ?? 612;
    const H = p.height ?? 792;
    const xobjects: Record<string, unknown> = {};
    const ops: string[] = [];
    (p.images ?? []).forEach((im, i) => {
      let ref = imageRefs.get(im.rgba);
      if (!ref) {
        const image = rgbaToImage(mupdf, im.rgba, im.encoding);
        ref = doc.addImage(image);
        image.destroy();
        imageRefs.set(im.rgba, ref);
      }
      const name = im.name ?? `Im${index}_${i}`;
      xobjects[name] = ref;
      ops.push(`q ${im.w} 0 0 ${im.h} ${im.x} ${im.y} cm /${name} Do Q`);
    });
    if (p.text && p.text.length) {
      ops.push("BT /F1 14 Tf 72 740 Td 18 TL");
      for (const line of p.text) ops.push(`(${line.replace(/[()\\]/g, "\\$&")}) Tj T*`);
      ops.push("ET");
    }
    const resources = { Font: { F1: font }, XObject: xobjects };
    const pageObj = doc.addPage([0, 0, W, H], 0, resources, ops.join("\n"));
    doc.insertPage(-1, pageObj);
    if (p.link) {
      const page = doc.loadPage(index);
      page.createLink([p.link.x, p.link.y, p.link.x + p.link.w, p.link.y + p.link.h], p.link.uri);
      page.destroy();
    }
  });
  if (opts.outline) {
    const it = doc.outlineIterator();
    it.insert({ title: "Inicio", uri: "#page=1", open: false });
    it.destroy();
  }
  if (opts.metadata) {
    doc.setMetaData("info:Title", "Documento de prueba");
    doc.setMetaData("info:Author", "Prensa");
    doc.setMetaData("info:Producer", "fixtures");
  }
  const buf = doc.saveToBuffer("compress");
  try {
    return new Uint8Array(buf.asUint8Array());
  } finally {
    buf.destroy();
    doc.destroy();
  }
}
