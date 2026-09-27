/**
 * Carga perezosa de MuPDF.js (WASM, ~3.6 MB comprimido). Un solo módulo por
 * contexto (worker o proceso Node); se comparte entre análisis y compresión.
 */
import type * as MuPDFModule from "mupdf";

export type Mu = typeof MuPDFModule;
export type PDFDocument = MuPDFModule.PDFDocument;
export type PDFObject = MuPDFModule.PDFObject;
export type PDFPage = MuPDFModule.PDFPage;
export type Pixmap = MuPDFModule.Pixmap;
export type Image = MuPDFModule.Image;
export type Matrix = MuPDFModule.Matrix;

let modulePromise: Promise<Mu> | null = null;

export function loadMupdf(): Promise<Mu> {
  modulePromise ??= import("mupdf").then((m) => {
    const mod = m;
    // Silenciar warnings de MuPDF (PDFs "reparados", fuentes faltantes…): los
    // reportamos nosotros de forma controlada.
    mod.setLog({ warning: () => {}, error: () => {} });
    return mod;
  });
  return modulePromise;
}

/** Ejecuta fn y garantiza destroy() de los recursos WASM registrados. */
export function withScope<T>(fn: (track: <R extends { destroy(): void }>(r: R) => R) => T): T {
  const resources: Array<{ destroy(): void }> = [];
  const track = <R extends { destroy(): void }>(r: R): R => {
    resources.push(r);
    return r;
  };
  try {
    return fn(track);
  } finally {
    for (let i = resources.length - 1; i >= 0; i--) {
      try {
        resources[i]?.destroy();
      } catch {
        /* ya destruido */
      }
    }
  }
}
