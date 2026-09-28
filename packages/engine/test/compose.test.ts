import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../src/compose";
import type { Mu, PDFDocument } from "../src/mupdf";
import { initNodeEngine } from "../src/node";
import { buildPdf, makeGraphic } from "./fixtures";

let mupdf: Mu;
beforeAll(async () => {
  mupdf = await initNodeEngine();
});

function textOf(doc: PDFDocument, index: number): string {
  const page = doc.loadPage(index);
  try {
    const st = page.toStructuredText("preserve-whitespace");
    try {
      return st.asText();
    } finally {
      st.destroy();
    }
  } finally {
    page.destroy();
  }
}

describe("unir / componer páginas", () => {
  it("inserta páginas de varios documentos en el orden pedido, con giro, duplicado y marcadores", async () => {
    const a = new mupdf.PDFDocument(buildPdf(mupdf, ["Texto uno", "Texto dos", "Texto tres"].map((t) => ({ text: [t] }))));
    const graphic = makeGraphic(400, 300);
    const b = new mupdf.PDFDocument(
      buildPdf(mupdf, [
        { images: [{ rgba: graphic, x: 72, y: 300, w: 300, h: 225, encoding: { type: "jpeg", quality: 90 } }], text: ["Ilustracion uno"] },
        { images: [{ rgba: graphic, x: 72, y: 300, w: 300, h: 225, encoding: { type: "jpeg", quality: 90 } }], text: ["Ilustracion dos"] },
      ]),
    );
    const sources = new Map([
      ["a", { name: "texto.pdf", doc: a }],
      ["b", { name: "ilustraciones.pdf", doc: b }],
    ]);
    const progress: number[] = [];
    const out = await composeDocument(
      mupdf,
      sources,
      {
        pages: [
          { source: "a", page: 0 },
          { source: "b", page: 1 },
          { source: "a", page: 1 },
          { source: "b", page: 0 },
          { source: "a", page: 2 },
          { source: "a", page: 0, rotate: 90 },
        ],
        title: "Compuesto",
      },
      { onProgress: (done) => progress.push(done) },
    );
    expect(out.result.pageCount).toBe(6);
    expect(out.result.sources).toBe(2);
    expect(out.result.bookmarks).toBe(2);
    expect(out.result.verification).toEqual({ pagesOk: true, textOk: true });
    expect(progress.at(-1)).toBe(6);

    const doc = new mupdf.PDFDocument(out.bytes);
    expect(doc.countPages()).toBe(6);
    expect(textOf(doc, 0)).toContain("Texto uno");
    expect(textOf(doc, 1)).toContain("Ilustracion dos");
    expect(textOf(doc, 2)).toContain("Texto dos");
    expect(textOf(doc, 3)).toContain("Ilustracion uno");
    expect(textOf(doc, 4)).toContain("Texto tres");
    expect(textOf(doc, 5)).toContain("Texto uno"); // duplicada
    expect(doc.findPage(5).get("Rotate").asNumber()).toBe(90);
    const rotate0 = doc.findPage(0).get("Rotate");
    expect(rotate0.isNull() || rotate0.asNumber() === 0).toBe(true);
    const outline = (doc.loadOutline() ?? []).map((o) => [o.title, o.page]);
    expect(outline).toEqual([
      ["texto", 0],
      ["ilustraciones", 1],
    ]);
    expect(doc.getMetaData("info:Title")).toBe("Compuesto");
    doc.destroy();
    a.destroy();
    b.destroy();
  });

  it("rechaza páginas fuera de rango y documentos desconocidos", async () => {
    const a = new mupdf.PDFDocument(buildPdf(mupdf, [{ text: ["Solo una"] }]));
    const sources = new Map([["a", { name: "uno.pdf", doc: a }]]);
    await expect(composeDocument(mupdf, sources, { pages: [{ source: "a", page: 3 }] })).rejects.toThrow(/no existe/);
    await expect(composeDocument(mupdf, sources, { pages: [{ source: "zzz", page: 0 }] })).rejects.toThrow(/no disponible/);
    a.destroy();
  });

  it("un solo documento no genera marcadores y conserva el texto", async () => {
    const a = new mupdf.PDFDocument(buildPdf(mupdf, [{ text: ["Alfa"] }, { text: ["Beta"] }]));
    const sources = new Map([["a", { name: "uno.pdf", doc: a }]]);
    const out = await composeDocument(mupdf, sources, { pages: [{ source: "a", page: 1 }, { source: "a", page: 0 }] });
    expect(out.result.bookmarks).toBe(0);
    const doc = new mupdf.PDFDocument(out.bytes);
    expect(textOf(doc, 0)).toContain("Beta");
    expect(doc.loadOutline() ?? []).toEqual([]);
    doc.destroy();
    a.destroy();
  });
});
