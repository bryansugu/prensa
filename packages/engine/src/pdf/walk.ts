/**
 * Recorre los recursos de cada página (XObjects, Form XObjects anidados,
 * patrones y apariencias de anotaciones) y devuelve cada imagen única con
 * las páginas donde aparece.
 */
import type { PDFDocument, PDFObject } from "../mupdf";
import { asName, forEachEntry, get, isStreamRef, objectNumber, resolveArray, resolveDict } from "./objects";

export interface ImageRef {
  objectNumber: number;
  /** Referencia indirecta (para loadImage) */
  ref: PDFObject;
  /** Diccionario resuelto (solo lectura de claves). Para leer/escribir el stream usar `ref`. */
  stream: PDFObject;
  pages: Set<number>;
  /** Cantidad de veces referenciada desde diccionarios de recursos */
  references: number;
}

export interface FontRef {
  objectNumber: number;
  fontDict: PDFObject;
  embeddedFile: PDFObject | null;
  subset: boolean;
}

export interface WalkResult {
  images: Map<number, ImageRef>;
  fonts: Map<number, FontRef>;
  /** Bytes de streams de contenido de página (sumados) */
  contentBytes: number;
}

const MAX_DEPTH = 12;

export function walkDocument(doc: PDFDocument, pageCount: number): WalkResult {
  const images = new Map<number, ImageRef>();
  const fonts = new Map<number, FontRef>();
  const visitedForms = new Set<number>();
  let contentBytes = 0;

  for (let i = 0; i < pageCount; i++) {
    let pageObj: PDFObject;
    try {
      pageObj = doc.findPage(i);
    } catch {
      continue;
    }
    const resources = pageObj.getInheritable("Resources");
    walkResources(resources, i, 0);

    // Streams de contenido
    const contents = get(pageObj, "Contents");
    if (contents) {
      const arr = resolveArray(contents);
      if (arr) forEachEntry(arr, (s) => (contentBytes += lengthOf(s)));
      else contentBytes += lengthOf(contents);
    }

    // Apariencias de anotaciones (/AP /N|/D|/R → Form XObject o dict de estados)
    const annots = resolveArray(get(pageObj, "Annots"));
    forEachEntry(annots, (annot) => {
      const ap = resolveDict(get(annot, "AP"));
      forEachEntry(ap, (state) => {
        if (isStreamRef(state)) walkForm(state, i, 1);
        else forEachEntry(resolveDict(state), (sub) => walkForm(sub, i, 1));
      });
    });
  }

  return { images, fonts, contentBytes };

  function lengthOf(streamRef: PDFObject): number {
    const s = resolveDict(streamRef);
    const len = get(s, "Length");
    try {
      return len && len.isNumber() ? len.asNumber() : 0;
    } catch {
      return 0;
    }
  }

  function walkForm(formRef: PDFObject, page: number, depth: number) {
    const form = resolveDict(formRef);
    if (!form || !isStreamRef(formRef)) return;
    const num = objectNumber(formRef);
    if (num != null) {
      if (visitedForms.has(num)) return;
      visitedForms.add(num);
    }
    // El stream del Form XObject es contenido vectorial (figuras, logos…)
    contentBytes += lengthOf(formRef);
    walkResources(get(form, "Resources"), page, depth + 1);
  }

  function walkResources(resourcesRef: PDFObject | null, page: number, depth: number) {
    if (depth > MAX_DEPTH) return;
    const resources = resolveDict(resourcesRef);
    if (!resources) return;

    forEachEntry(resolveDict(get(resources, "XObject")), (xref) => {
      const x = resolveDict(xref);
      if (!x || !isStreamRef(xref)) return;
      const subtype = asName(get(x, "Subtype"));
      if (subtype === "Image") {
        const num = objectNumber(xref);
        if (num == null) return; // streams siempre son indirectos; si no, ignorar
        const existing = images.get(num);
        if (existing) {
          existing.pages.add(page);
          existing.references++;
        } else {
          images.set(num, { objectNumber: num, ref: xref, stream: x, pages: new Set([page]), references: 1 });
        }
      } else if (subtype === "Form") {
        walkForm(xref, page, depth);
      }
    });

    forEachEntry(resolveDict(get(resources, "Pattern")), (pref) => {
      if (isStreamRef(pref)) walkForm(pref, page, depth); // patrón de mosaico
    });

    forEachEntry(resolveDict(get(resources, "Font")), (fref) => {
      const f = resolveDict(fref);
      if (!f) return;
      collectFont(fref, f);
      // Type0: la fuente real está en DescendantFonts
      const desc = resolveArray(get(f, "DescendantFonts"));
      forEachEntry(desc, (dref) => {
        const d = resolveDict(dref);
        if (d) collectFont(dref, d);
      });
    });
  }

  function collectFont(fref: PDFObject, f: PDFObject) {
    const num = objectNumber(fref);
    if (num == null || fonts.has(num)) return;
    const descriptor = resolveDict(get(f, "FontDescriptor"));
    let embedded: PDFObject | null = null;
    for (const key of ["FontFile", "FontFile2", "FontFile3"]) {
      const ff = get(descriptor, key);
      if (ff) {
        embedded = ff;
        break;
      }
    }
    const baseFont = asName(get(f, "BaseFont")) ?? "";
    fonts.set(num, {
      objectNumber: num,
      fontDict: f,
      embeddedFile: embedded,
      subset: /^[A-Z]{6}\+/.test(baseFont),
    });
  }
}
