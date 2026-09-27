/**
 * Mide el tamaño real con el que se dibuja cada imagen ejecutando la página
 * con un Device propio (fillImage recibe la matriz de transformación). De ahí
 * sale el DPI efectivo, que es lo que decide cuánto se puede reducir sin
 * perder detalle visible.
 */
import type { Image, Mu, PDFDocument, PDFPage } from "../mupdf";
import type { ImageRef } from "./walk";

export interface Placement {
  /** Mayor ancho/alto dibujado en puntos (1/72 in) entre todas las apariciones */
  maxWidthPt: number;
  maxHeightPt: number;
  /** Menor DPI efectivo observado (el que manda) */
  minDpi: number;
  occurrences: number;
}

export type PlacementMap = Map<number, Placement>;

interface Candidate {
  objectNumber: number;
  width: number;
  height: number;
  image: Image;
}

/**
 * Recorre `pages` (índices) midiendo las imágenes listadas en `refs`.
 * Emparejamos la imagen que recibe el device con su XObject por identidad de
 * puntero (MuPDF cachea la imagen decodificada por objeto); si no coincide,
 * caemos a dimensiones (ancho×alto). Devuelve la cantidad de imágenes que no
 * se pudieron ubicar.
 */
export function measurePlacements(
  mupdf: Mu,
  doc: PDFDocument,
  refs: Map<number, ImageRef>,
  pageCount: number,
  onPage?: (page: number) => void,
): { placements: PlacementMap; unmatched: number } {
  const placements: PlacementMap = new Map();
  const byPage = new Map<number, ImageRef[]>();
  for (const ref of refs.values()) {
    for (const p of ref.pages) {
      const list = byPage.get(p) ?? [];
      list.push(ref);
      byPage.set(p, list);
    }
  }

  let unmatched = 0;
  for (let i = 0; i < pageCount; i++) {
    const list = byPage.get(i);
    if (!list || list.length === 0) continue;
    onPage?.(i);

    const candidates: Candidate[] = [];
    for (const ref of list) {
      try {
        const image = doc.loadImage(ref.ref);
        candidates.push({ objectNumber: ref.objectNumber, width: image.getWidth(), height: image.getHeight(), image });
      } catch {
        /* imagen indecodificable: se ignora aquí; el pipeline la saltará */
      }
    }
    const byPointer = new Map<number, Candidate>();
    for (const c of candidates) byPointer.set(c.image.pointer, c);

    const record = (image: Image, ctm: number[]) => {
      const ptr = image.pointer as unknown as number;
      let c = byPointer.get(ptr);
      if (!c) {
        const w = image.getWidth();
        const h = image.getHeight();
        const dims = candidates.filter((k) => k.width === w && k.height === h);
        if (dims.length === 1) c = dims[0];
      }
      if (!c) {
        unmatched++;
        return;
      }
      const a = ctm[0] ?? 0;
      const b = ctm[1] ?? 0;
      const cc = ctm[2] ?? 0;
      const d = ctm[3] ?? 0;
      const wPt = Math.hypot(a, b);
      const hPt = Math.hypot(cc, d);
      if (!(wPt > 0) || !(hPt > 0)) return;
      const dpi = Math.min((c.width * 72) / wPt, (c.height * 72) / hPt);
      const prev = placements.get(c.objectNumber);
      if (prev) {
        prev.maxWidthPt = Math.max(prev.maxWidthPt, wPt);
        prev.maxHeightPt = Math.max(prev.maxHeightPt, hPt);
        prev.minDpi = Math.min(prev.minDpi, dpi);
        prev.occurrences++;
      } else {
        placements.set(c.objectNumber, { maxWidthPt: wPt, maxHeightPt: hPt, minDpi: dpi, occurrences: 1 });
      }
    };

    let page: PDFPage | null = null;
    let device: InstanceType<Mu["Device"]> | null = null;
    try {
      page = doc.loadPage(i);
      device = new mupdf.Device({
        fillImage: (image, ctm) => record(image, ctm),
        fillImageMask: (image, ctm) => record(image, ctm),
        clipImageMask: (image, ctm) => record(image, ctm),
      });
      // Contenido + anotaciones (sellos/firmas con imágenes)
      page.run(device, mupdf.Matrix.identity);
      device.close();
    } catch {
      /* página corrupta: sin mediciones */
    } finally {
      try {
        device?.destroy();
      } catch {
        /* ignore */
      }
      try {
        page?.destroy();
      } catch {
        /* ignore */
      }
      for (const c of candidates) {
        try {
          c.image.destroy();
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { placements, unmatched };
}
