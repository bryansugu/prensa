import { beforeAll, describe, expect, it } from "vitest";
import { defaultSpec } from "@prensa/schema";
import { analyzeBytes, compressBytes, initNodeEngine } from "../src/node";
import type { Mu } from "../src/mupdf";
import { buildPdf, makeGraphic, makePhoto, makeScan } from "./fixtures";

let mupdf: Mu;
beforeAll(async () => {
  mupdf = await initNodeEngine();
});

const LOREM = [
  "Prensa comprime PDF sin perder calidad.",
  "Los enlaces, formularios y marcadores se conservan.",
  "Este texto debe extraerse igual antes y despues.",
];

describe("análisis", () => {
  it("mide el DPI efectivo real de cada imagen", async () => {
    // Foto de 1200 px dibujada en 300 pt (≈ 4.17 in) → 288 dpi
    const photo = makePhoto(1200, 800);
    const pdf = buildPdf(mupdf, [
      { images: [{ rgba: photo, x: 72, y: 300, w: 300, h: 200, encoding: { type: "jpeg", quality: 92 } }], text: LOREM },
    ]);
    const { report } = await analyzeBytes(pdf, "foto.pdf");
    expect(report.pageCount).toBe(1);
    expect(report.images).toHaveLength(1);
    const img = report.images[0]!;
    expect(img.width).toBe(1200);
    expect(img.effectiveDpi).toBeGreaterThan(280);
    expect(img.effectiveDpi).toBeLessThan(296);
    expect(img.kind).toBe("photo");
    expect(report.textPages).toBe(1);
    expect(report.docType).toBe("mixed");
    expect(report.estimates.balanced.bytes).toBeLessThan(report.fileSize);
    expect(report.estimates.lossless.bytes).toBeLessThanOrEqual(report.fileSize);
  });

  it("detecta enlaces, marcadores y metadatos", async () => {
    const pdf = buildPdf(
      mupdf,
      [{ text: LOREM, link: { x: 72, y: 700, w: 200, h: 20, uri: "https://polen.cdc.cool" } }],
      { outline: true, metadata: true },
    );
    const { report } = await analyzeBytes(pdf, "links.pdf");
    expect(report.features.links).toBe(true);
    expect(report.features.bookmarks).toBe(true);
    expect(report.features.forms).toBe(false);
    expect(report.docType).toBe("text");
  });
});

describe("compresión", () => {
  it("reduce una foto sobredimensionada al DPI del preset conservando el texto", async () => {
    const photo = makePhoto(2400, 1600);
    const pdf = buildPdf(mupdf, [
      { images: [{ rgba: photo, x: 72, y: 200, w: 400, h: 267, encoding: { type: "jpeg", quality: 95 } }], text: LOREM },
    ]);
    const out = await compressBytes(pdf, defaultSpec("balanced"), { fileName: "foto.pdf" });
    expect(out.result.returnedOriginal).toBe(false);
    expect(out.bytes.length).toBeLessThan(pdf.length * 0.5);
    expect(out.result.verification.pagesOk).toBe(true);
    expect(out.result.verification.textOk).toBe(true);
    expect(out.result.imagesDownsampled).toBe(1);
    const img = out.images[0]!;
    // 400 pt = 5.56 in × 150 dpi ≈ 833 px
    expect(img.width).toBeGreaterThan(780);
    expect(img.width).toBeLessThan(880);
    expect(img.ssim ?? 1).toBeGreaterThanOrEqual(0.94);
    // El resultado se puede reabrir y analizar
    const { report } = await analyzeBytes(out.bytes, "salida.pdf");
    expect(report.images[0]!.filter).toBe("DCTDecode");
  });

  it("elige paleta indexada sin pérdida para gráficos planos", async () => {
    const graphic = makeGraphic(1000, 600);
    const pdf = buildPdf(mupdf, [
      { images: [{ rgba: graphic, x: 50, y: 300, w: 500, h: 300, encoding: { type: "jpeg", quality: 90 } }] },
    ]);
    const out = await compressBytes(pdf, defaultSpec("balanced"), { fileName: "grafico.pdf" });
    expect(out.images[0]!.codec).toBe("indexed");
    expect(out.images[0]!.ssim).toBe(1);
    expect(out.bytes.length).toBeLessThan(pdf.length);
  });

  it("sin pérdida: no toca fotos ya en JPEG y nunca agranda", async () => {
    const photo = makePhoto(800, 600);
    const pdf = buildPdf(mupdf, [
      { images: [{ rgba: photo, x: 72, y: 200, w: 400, h: 300, encoding: { type: "jpeg", quality: 80 } }], text: LOREM },
    ]);
    const out = await compressBytes(pdf, defaultSpec("lossless"), { fileName: "lossless.pdf" });
    expect(out.bytes.length).toBeLessThanOrEqual(pdf.length);
    expect(out.images[0]!.action).toBe("kept");
  });

  it("conserva enlaces y marcadores por defecto", async () => {
    const photo = makePhoto(1600, 1000);
    const pdf = buildPdf(
      mupdf,
      [
        {
          images: [{ rgba: photo, x: 72, y: 100, w: 300, h: 190, encoding: { type: "jpeg", quality: 92 } }],
          text: LOREM,
          link: { x: 72, y: 700, w: 200, h: 20, uri: "https://polen.cdc.cool" },
        },
      ],
      { outline: true },
    );
    const out = await compressBytes(pdf, defaultSpec("screen"), { fileName: "links.pdf" });
    expect(out.result.verification.interactivityOk).toBe(true);
    const { report } = await analyzeBytes(out.bytes, "links-out.pdf");
    expect(report.features.links).toBe(true);
    expect(report.features.bookmarks).toBe(true);
  });

  it("elimina enlaces y marcadores cuando se pide", async () => {
    const pdf = buildPdf(mupdf, [{ text: LOREM, link: { x: 72, y: 700, w: 200, h: 20, uri: "https://x.y" } }], { outline: true });
    const spec = defaultSpec("balanced");
    spec.preserve.links = false;
    spec.preserve.bookmarks = false;
    const out = await compressBytes(pdf, spec, { fileName: "strip.pdf" });
    const { report } = await analyzeBytes(out.bytes, "strip-out.pdf");
    expect(report.features.links).toBe(false);
    expect(report.features.bookmarks).toBe(false);
  });

  it("blanco y negro adaptativo para escaneos", async () => {
    const scan = makeScan(1700, 2200);
    const pdf = buildPdf(mupdf, [
      { images: [{ rgba: scan, x: 0, y: 0, w: 612, h: 792, encoding: { type: "jpeg", quality: 85 } }] },
    ]);
    const spec = defaultSpec("balanced");
    spec.images.color = "bilevel";
    const out = await compressBytes(pdf, spec, { fileName: "scan.pdf" });
    expect(out.images[0]!.codec).toBe("bilevel");
    expect(out.bytes.length).toBeLessThan(pdf.length * 0.3);
  });

  it("rasterizar produce un PDF solo de imágenes", async () => {
    const pdf = buildPdf(mupdf, [{ text: LOREM }, { text: LOREM }]);
    const spec = defaultSpec("screen");
    spec.mode = "rasterize";
    const out = await compressBytes(pdf, spec, { fileName: "raster.pdf" });
    const { report } = await analyzeBytes(out.bytes, "raster-out.pdf");
    expect(report.pageCount).toBe(2);
    expect(report.images.length).toBe(2);
    expect(report.textPages).toBe(0);
  });

  it("reporta progreso hasta done", async () => {
    const pdf = buildPdf(mupdf, [{ text: LOREM }]);
    const stages: string[] = [];
    await compressBytes(pdf, defaultSpec(), { fileName: "p.pdf", onProgress: (e) => stages.push(e.stage) });
    expect(stages[0]).toBe("open");
    expect(stages.at(-1)).toBe("done");
  });
});

describe("inteligente y objetivo de tamaño", () => {
  it("el preset inteligente adapta parámetros al tipo de documento", async () => {
    const scan = makeScan(1700, 2200);
    const pdf = buildPdf(mupdf, [{ images: [{ rgba: scan, x: 0, y: 0, w: 612, h: 792, encoding: { type: "jpeg", quality: 85 } }] }]);
    const out = await compressBytes(pdf, defaultSpec("smart"), { fileName: "scan.pdf" });
    expect(out.result.notes.some((n) => n.startsWith("Inteligente: documento scanned"))).toBe(true);
    // Escaneado → 150 dpi sobre 612 pt (8,5 in) = 1275 px de ancho
    expect(out.images[0]!.width).toBe(1275);
  });

  it("barre /PieceInfo y datos privados también fuera del catálogo y las páginas", async () => {
    const photo = makePhoto(600, 400, 3);
    const base = buildPdf(mupdf, [{ images: [{ rgba: photo, x: 72, y: 200, w: 300, h: 200, encoding: { type: "jpeg", quality: 90 } }] }]);
    // Datos privados incompresibles colgados de la página y del XObject de imagen (como hace Illustrator).
    const doc = new mupdf.PDFDocument(base);
    const junk = new Uint8Array(200_000);
    for (let i = 0; i < junk.length; i++) junk[i] = (Math.random() * 256) | 0;
    const makePieceInfo = () => {
      const priv = doc.newDictionary();
      priv.put("Private", doc.addStream(junk, {}));
      const pi = doc.newDictionary();
      pi.put("Illustrator", priv);
      return pi;
    };
    const page = doc.findPage(0);
    page.put("PieceInfo", makePieceInfo());
    page.put("LastModified", doc.newString("D:20260101000000Z"));
    const xobjects = page.get("Resources").get("XObject");
    xobjects.forEach((ref) => {
      ref.put("PieceInfo", makePieceInfo());
      ref.put("PTEX.FileName", doc.newString("./figura.pdf"));
    });
    const dirty = new Uint8Array(doc.saveToBuffer("compress").asUint8Array());
    doc.destroy();

    const kept = await compressBytes(dirty, { preset: "lossless", remove: { pieceInfo: false } }, { fileName: "priv.pdf" });
    const swept = await compressBytes(dirty, { preset: "lossless", remove: { pieceInfo: true } }, { fileName: "priv.pdf" });
    // Dos streams de 200 KB de ruido desaparecen solo con el barrido.
    expect(kept.bytes.length - swept.bytes.length).toBeGreaterThan(350_000);
    expect(swept.result.notes.some((n) => n.startsWith("Datos privados de aplicación eliminados"))).toBe(true);
    const check = new mupdf.PDFDocument(swept.bytes);
    const outPage = check.findPage(0);
    expect(outPage.get("PieceInfo").isNull()).toBe(true);
    expect(outPage.get("LastModified").isNull()).toBe(true);
    outPage
      .get("Resources")
      .get("XObject")
      .forEach((ref) => {
        expect(ref.get("PieceInfo").isNull()).toBe(true);
        expect(ref.get("PTEX.FileName").isNull()).toBe(true);
        expect(ref.isStream()).toBe(true); // la imagen sigue ahí
      });
    check.destroy();
  });

  it("quita el XFA duplicado de un formulario híbrido y conserva el AcroForm", async () => {
    const base = buildPdf(mupdf, [{ text: LOREM }]);
    const doc = new mupdf.PDFDocument(base);
    const root = doc.getTrailer().get("Root");
    const page = doc.findPage(0);
    const field = doc.newDictionary();
    field.put("Type", doc.newName("Annot"));
    field.put("Subtype", doc.newName("Widget"));
    field.put("FT", doc.newName("Tx"));
    field.put("T", doc.newString("nombre"));
    field.put("F", 4);
    const rect = doc.newArray();
    for (const v of [72, 72, 300, 100]) rect.push(v);
    field.put("Rect", rect);
    field.put("P", page);
    const fieldRef = doc.addObject(field);
    const annots = doc.newArray();
    annots.push(fieldRef);
    page.put("Annots", annots);
    const fields = doc.newArray();
    fields.push(fieldRef);
    const xfaJunk = new Uint8Array(60_000);
    for (let i = 0; i < xfaJunk.length; i++) xfaJunk[i] = (Math.random() * 256) | 0;
    const xfa = doc.newArray();
    xfa.push(doc.newString("template"));
    xfa.push(doc.addStream(xfaJunk, {}));
    const acro = doc.newDictionary();
    acro.put("Fields", fields);
    acro.put("XFA", xfa);
    root.put("AcroForm", acro);
    const hybrid = new Uint8Array(doc.saveToBuffer("compress").asUint8Array());
    doc.destroy();

    const out = await compressBytes(hybrid, { preset: "lossless" }, { fileName: "form.pdf" });
    expect(out.result.notes.some((n) => n.startsWith("Datos XFA duplicados eliminados"))).toBe(true);
    expect(out.result.verification.interactivityOk).toBe(true);
    expect(hybrid.length - out.bytes.length).toBeGreaterThan(50_000);
    const check = new mupdf.PDFDocument(out.bytes);
    const outAcro = check.getTrailer().get("Root").get("AcroForm");
    expect(outAcro.get("XFA").isNull()).toBe(true);
    expect(outAcro.get("Fields").length).toBe(1);
    check.destroy();

    const keep = await compressBytes(hybrid, { preset: "lossless", remove: { xfa: false } }, { fileName: "form.pdf" });
    const check2 = new mupdf.PDFDocument(keep.bytes);
    expect(check2.getTrailer().get("Root").get("AcroForm").get("XFA").isNull()).toBe(false);
    check2.destroy();
  });

  it("objetivo de tamaño baja presets hasta cumplir", async () => {
    const photo = makePhoto(2400, 1600, 5);
    const pdf = buildPdf(mupdf, [
      { images: [{ rgba: photo, x: 72, y: 200, w: 400, h: 267, encoding: { type: "jpeg", quality: 96 } }], text: LOREM },
    ]);
    const spec = defaultSpec("maximum");
    spec.output.targetSizeBytes = 60_000;
    const out = await compressBytes(pdf, spec, { fileName: "target.pdf" });
    expect(out.bytes.length).toBeLessThanOrEqual(60_000);
    expect(out.result.notes.some((n) => n.startsWith("Objetivo de tamaño alcanzado"))).toBe(true);
    expect(out.result.preset).not.toBe("maximum");
  });
});
