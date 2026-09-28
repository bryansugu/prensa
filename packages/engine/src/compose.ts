/**
 * Compositor de páginas ("Unir"): construye un PDF nuevo tomando páginas de
 * varios documentos en el orden exacto que pide el usuario (unir, intercalar,
 * reordenar, duplicar, girar). Usa los graft maps de MuPDF: los recursos
 * compartidos de cada documento de origen (fuentes, imágenes) se copian una
 * sola vez aunque aparezcan en muchas páginas.
 */
import { ComposeSpec, type ComposeResult, type ComposeSpecInput } from "@prensa/schema";
import type { Mu, PDFDocument } from "./mupdf";
import { asNumber, get } from "./pdf/objects";

export interface ComposeSource {
  name: string;
  doc: PDFDocument;
}

export interface ComposeOptions {
  signal?: AbortSignal | undefined;
  onProgress?: ((done: number, total: number) => void) | undefined;
}

export interface ComposeOutput {
  bytes: Uint8Array;
  result: ComposeResult;
}

type GraftMap = ReturnType<PDFDocument["newGraftMap"]>;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const YIELD_EVERY = 8;

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
}

export async function composeDocument(
  mupdf: Mu,
  sources: ReadonlyMap<string, ComposeSource>,
  specInput: ComposeSpecInput,
  opts: ComposeOptions = {},
): Promise<ComposeOutput> {
  const t0 = now();
  const spec = ComposeSpec.parse(specInput);
  for (const ref of spec.pages) {
    const src = sources.get(ref.source);
    if (!src) throw new Error(`Documento de origen no disponible: ${ref.source}`);
    const count = src.doc.countPages();
    if (ref.page >= count) throw new Error(`La página ${ref.page + 1} no existe en ${src.name} (${count} páginas)`);
  }

  const out = new mupdf.PDFDocument();
  const maps = new Map<string, GraftMap>();
  const notes: string[] = [];
  try {
    const total = spec.pages.length;
    for (let i = 0; i < total; i++) {
      throwIfAborted(opts.signal);
      const ref = spec.pages[i]!;
      const src = sources.get(ref.source)!;
      let map = maps.get(ref.source);
      if (!map) {
        map = out.newGraftMap();
        maps.set(ref.source, map);
      }
      // Cada graft crea un diccionario de página nuevo (se puede repetir la
      // misma página de origen); contenido y recursos se comparten vía el map.
      map.graftPage(i, src.doc, ref.page);
      if (ref.rotate) {
        const pageObj = out.findPage(i);
        const current = asNumber(get(pageObj, "Rotate"), 0);
        pageObj.put("Rotate", (((current + ref.rotate) % 360) + 360) % 360);
      }
      opts.onProgress?.(i + 1, total);
      // Deja pasar mensajes (cancelación, progreso) en el worker.
      if (i % YIELD_EVERY === YIELD_EVERY - 1) await new Promise<void>((r) => setTimeout(r, 0));
    }

    let bookmarks = 0;
    if (spec.bookmarks) {
      bookmarks = addSourceBookmarks(mupdf, out, sources, spec.pages);
      if (bookmarks) notes.push(`${bookmarks} marcadores creados, uno por documento`);
    }
    try {
      if (spec.title) out.setMetaData("info:Title", spec.title);
      out.setMetaData("info:Producer", "Prensa · Centro de Diseño (MuPDF)");
    } catch {
      /* metadatos opcionales */
    }

    const buf = out.saveToBuffer("garbage=deduplicate,compress,objstms");
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(buf.asUint8Array());
    } finally {
      buf.destroy();
    }

    const verification = verifyComposed(mupdf, bytes, sources, spec.pages);
    if (!verification.pagesOk) notes.push("La verificación de páginas falló; revisa el resultado.");
    else if (!verification.textOk) notes.push("El texto de alguna página de muestra no coincide con el original.");
    const distinct = new Set(spec.pages.map((p) => p.source)).size;
    return {
      bytes,
      result: {
        pageCount: total,
        sources: distinct,
        outputSize: bytes.length,
        durationMs: Math.round(now() - t0),
        bookmarks,
        verification,
        notes,
      },
    };
  } finally {
    for (const m of maps.values()) {
      try {
        m.destroy();
      } catch {
        /* ya liberado */
      }
    }
    out.destroy();
  }
}

/** Un marcador por documento de origen (en su primera aparición), solo si hay varios. */
function addSourceBookmarks(
  mupdf: Mu,
  out: PDFDocument,
  sources: ReadonlyMap<string, ComposeSource>,
  pages: ComposeSpec["pages"],
): number {
  const first = new Map<string, number>();
  pages.forEach((p, i) => {
    if (!first.has(p.source)) first.set(p.source, i);
  });
  if (first.size < 2) return 0;
  let it: ReturnType<PDFDocument["outlineIterator"]> | null = null;
  try {
    it = out.outlineIterator();
    for (const [id, index] of first) {
      const title = (sources.get(id)?.name ?? "Documento").replace(/\.pdf$/i, "");
      const uri = out.formatLinkURI(new mupdf.LinkDestination(0, index, "Fit", 0, 0, 0, 0, 0));
      it.insert({ title, uri, open: false });
    }
    return first.size;
  } catch {
    return 0;
  } finally {
    it?.destroy();
  }
}

function pageText(doc: PDFDocument, index: number): string {
  const page = doc.loadPage(index);
  try {
    const st = page.toStructuredText("preserve-whitespace");
    try {
      return st.asText().replace(/\s+/g, " ").trim();
    } finally {
      st.destroy();
    }
  } finally {
    page.destroy();
  }
}

function verifyComposed(
  mupdf: Mu,
  bytes: Uint8Array,
  sources: ReadonlyMap<string, ComposeSource>,
  pages: ComposeSpec["pages"],
): ComposeResult["verification"] {
  let doc: PDFDocument | null = null;
  try {
    doc = new mupdf.PDFDocument(bytes);
    const pagesOk = doc.countPages() === pages.length;
    if (!pagesOk) return { pagesOk, textOk: false };
    const samples = [...new Set([0, Math.floor(pages.length / 2), pages.length - 1])];
    for (const i of samples) {
      const ref = pages[i]!;
      const src = sources.get(ref.source)!;
      if (pageText(doc, i) !== pageText(src.doc, ref.page)) return { pagesOk, textOk: false };
    }
    return { pagesOk, textOk: true };
  } catch {
    return { pagesOk: false, textOk: false };
  } finally {
    doc?.destroy();
  }
}
