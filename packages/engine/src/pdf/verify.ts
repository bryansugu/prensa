/** Verificación del resultado: páginas, texto, render de muestra e interactividad. */
import type { Verification } from "@prensa/schema";
import { normalizeText } from "../analyze";
import { pixmapToRgba } from "../images/pixels";
import { ssimScore } from "../images/quality";
import type { Mu, PDFDocument } from "../mupdf";
import { get, has, resolveArray, resolveDict } from "./objects";

export interface VerifyOptions {
  samplePages: number[];
  sampleText: Map<number, string>;
  sampleAnnots: Map<number, number>;
  expectText: boolean;
  expectAnnots: boolean;
  expectForm: boolean;
  expectOutlines: boolean;
  renderDpi?: number;
  /** Máx. páginas a renderizar (las de muestra más pesadas cuestan) */
  maxRenderPages?: number;
}

export function verifyOutput(mupdf: Mu, original: PDFDocument, output: PDFDocument, o: VerifyOptions): Verification {
  const pagesOk = original.countPages() === output.countPages();
  let textOk = true;
  let interactivityOk = true;
  let pageSsimMin: number | null = null;
  if (!pagesOk) return { pagesOk, textOk: false, pageSsimMin: null, interactivityOk: false };

  const renderPages = o.samplePages.slice(0, o.maxRenderPages ?? 3);
  const dpi = o.renderDpi ?? 36;
  for (const i of o.samplePages) {
    let page: ReturnType<PDFDocument["loadPage"]> | null = null;
    try {
      page = output.loadPage(i);
      if (o.expectText) {
        const st = page.toStructuredText("preserve-whitespace");
        const text = normalizeText(st.asText());
        st.destroy();
        const expected = o.sampleText.get(i) ?? "";
        if (expected.length > 0 && text !== expected) textOk = false;
      }
      if (o.expectAnnots) {
        const expected = o.sampleAnnots.get(i);
        if (expected != null && page.getAnnotations().length !== expected) interactivityOk = false;
      }
      if (renderPages.includes(i)) {
        const score = renderSsim(mupdf, original, output, i, dpi);
        if (score != null) pageSsimMin = pageSsimMin == null ? score : Math.min(pageSsimMin, score);
      }
    } catch {
      textOk = false;
    } finally {
      page?.destroy();
    }
  }

  const root = resolveDict(get(output.getTrailer(), "Root"));
  if (o.expectForm) {
    const fields = resolveArray(get(resolveDict(get(root, "AcroForm")), "Fields"));
    if (!fields || fields.length === 0) interactivityOk = false;
  }
  if (o.expectOutlines && !has(resolveDict(get(root, "Outlines")), "First")) interactivityOk = false;

  return { pagesOk, textOk, pageSsimMin, interactivityOk };
}

function renderSsim(mupdf: Mu, a: PDFDocument, b: PDFDocument, index: number, dpi: number): number | null {
  const m = mupdf.Matrix.scale(dpi / 72, dpi / 72);
  let pa: ReturnType<PDFDocument["loadPage"]> | null = null;
  let pb: ReturnType<PDFDocument["loadPage"]> | null = null;
  try {
    pa = a.loadPage(index);
    pb = b.loadPage(index);
    const pixA = pa.toPixmap(m, mupdf.ColorSpace.DeviceRGB, false, true);
    const pixB = pb.toPixmap(m, mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      const ra = pixmapToRgba(mupdf, pixA, true).rgba;
      const rb = pixmapToRgba(mupdf, pixB, true).rgba;
      if (ra.width !== rb.width || ra.height !== rb.height) return 0;
      const s = ssimScore(ra, rb);
      return Number.isNaN(s) ? null : s;
    } finally {
      pixA.destroy();
      pixB.destroy();
    }
  } catch {
    return null;
  } finally {
    pa?.destroy();
    pb?.destroy();
  }
}
