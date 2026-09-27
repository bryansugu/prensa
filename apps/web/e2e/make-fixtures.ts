/** Genera los PDFs de prueba (sintéticos, con MuPDF). Se corre con tsx antes de Playwright. */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { initNodeEngine } from "../../../packages/engine/src/node";
import { buildPdf, makeGraphic, makePhoto } from "../../../packages/engine/test/fixtures";

export const FIXTURES = path.resolve(import.meta.dirname, "fixtures");

async function main() {
  mkdirSync(FIXTURES, { recursive: true });
  const mupdf = await initNodeEngine();
  const text = ["Documento de prueba", "Texto seleccionable que debe conservarse.", "Con un enlace y un marcador."];
  for (let i = 1; i <= 5; i++) {
    const photo = makePhoto(1400, 900, i);
    writeFileSync(
      path.join(FIXTURES, `doc-${i}.pdf`),
      buildPdf(
        mupdf,
        [
          { images: [{ rgba: photo, x: 72, y: 300, w: 468, h: 300, encoding: { type: "jpeg", quality: 95 } }], text, link: { x: 72, y: 700, w: 200, h: 20, uri: "https://polen.cdc.cool" } },
          { text },
        ],
        { outline: true },
      ),
    );
  }
  // Pesado: 3 páginas con fotos grandes para poder cancelar a tiempo
  const heavyPages = [1, 2, 3].map((i) => ({
    images: [{ rgba: makePhoto(3200, 2400, 10 + i), x: 40, y: 100, w: 532, h: 400, encoding: { type: "jpeg" as const, quality: 97 } }],
    text,
  }));
  writeFileSync(path.join(FIXTURES, "pesado.pdf"), buildPdf(mupdf, heavyPages));
  writeFileSync(
    path.join(FIXTURES, "grafico.pdf"),
    buildPdf(mupdf, [{ images: [{ rgba: makeGraphic(1200, 800), x: 50, y: 250, w: 512, h: 341, encoding: { type: "png" } }], text }]),
  );
}

await main();
console.log(`fixtures en ${FIXTURES}`);
