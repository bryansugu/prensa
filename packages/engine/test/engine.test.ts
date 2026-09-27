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
