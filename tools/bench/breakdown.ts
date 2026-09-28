/**
 * Desglose de bytes de un PDF por tipo de objeto (para saber dónde está el
 * peso que nos falta recortar frente a otros compresores).
 *
 *   pnpm exec tsx tools/bench/breakdown.ts archivo.pdf [otro.pdf …]
 */
import { readFileSync } from "node:fs";
import { initNodeEngine } from "@prensa/engine/node";
import { formatBytes } from "@prensa/schema";
import type { PDFObject } from "mupdf";

type Bucket = "imágenes" | "fuentes" | "contenido" | "formularios-xobject" | "objstm/xref" | "metadatos" | "otros streams";

interface FontInfo {
  obj: number;
  name: string;
  kind: string;
  subset: boolean;
  bytes: number;
}

async function main() {
  const mupdf = await initNodeEngine();
  for (const file of process.argv.slice(2)) {
    const bytes = new Uint8Array(readFileSync(file));
    const doc = new mupdf.PDFDocument(bytes);
    const totals = new Map<Bucket, { n: number; bytes: number }>();
    const add = (b: Bucket, len: number) => {
      const t = totals.get(b) ?? { n: 0, bytes: 0 };
      t.n++;
      t.bytes += len;
      totals.set(b, t);
    };
    const fontFiles = new Map<number, FontInfo>();
    const contents = new Set<number>();
    const n = doc.countObjects();

    for (let i = 0; i < doc.countPages(); i++) {
      try {
        const c = doc.loadPage(i).getObject().get("Contents");
        if (c.isArray()) for (let k = 0; k < c.length; k++) contents.add(c.get(k).asIndirect());
        else if (c.isIndirect()) contents.add(c.asIndirect());
      } catch {
        /* página rota */
      }
    }
    for (let i = 1; i < n; i++) {
      try {
        const ref = doc.newIndirect(i);
        if (ref.isStream()) continue;
        const type = ref.get("Type");
        if (!type.isName() || type.asName() !== "FontDescriptor") continue;
        const name = ref.get("FontName");
        const fontName = name.isName() ? name.asName() : "?";
        for (const key of ["FontFile", "FontFile2", "FontFile3"]) {
          const ff = ref.get(key);
          if (!ff.isIndirect()) continue;
          const sub = ff.get("Subtype");
          const kind = key === "FontFile" ? "Type1" : key === "FontFile2" ? "TrueType" : sub.isName() ? sub.asName() : "FontFile3";
          fontFiles.set(ff.asIndirect(), { obj: ff.asIndirect(), name: fontName, kind, subset: /^[A-Z]{6}\+/.test(fontName), bytes: 0 });
        }
      } catch {
        /* objeto libre */
      }
    }

    let streamTotal = 0;
    for (let i = 1; i < n; i++) {
      let ref: PDFObject;
      try {
        ref = doc.newIndirect(i);
        if (!ref.isStream()) continue;
      } catch {
        continue;
      }
      const len = rawLength(ref);
      streamTotal += len;
      const type = (() => {
        try {
          const t = ref.get("Type");
          return t.isName() ? t.asName() : "";
        } catch {
          return "";
        }
      })();
      const subtype = (() => {
        try {
          const t = ref.get("Subtype");
          return t.isName() ? t.asName() : "";
        } catch {
          return "";
        }
      })();
      const font = fontFiles.get(i);
      if (font) {
        font.bytes = len;
        add("fuentes", len);
      } else if (subtype === "Image") add("imágenes", len);
      else if (subtype === "Form") add("formularios-xobject", len);
      else if (contents.has(i)) add("contenido", len);
      else if (type === "ObjStm" || type === "XRef") add("objstm/xref", len);
      else if (type === "Metadata") add("metadatos", len);
      else add("otros streams", len);
    }

    console.log(`\n${file}  (${formatBytes(bytes.length)}, ${doc.countPages()} págs, ${n} objetos)`);
    for (const [k, v] of [...totals.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
      console.log(`  ${k.padEnd(20)} ${String(v.n).padStart(5)}  ${formatBytes(v.bytes).padStart(10)}  ${((100 * v.bytes) / bytes.length).toFixed(1).padStart(5)} %`);
    }
    console.log(`  ${"diccionarios/xref".padEnd(20)}        ${formatBytes(bytes.length - streamTotal).padStart(10)}  ${((100 * (bytes.length - streamTotal)) / bytes.length).toFixed(1).padStart(5)} %`);
    const fonts = [...fontFiles.values()].sort((a, b) => b.bytes - a.bytes);
    if (fonts.length) {
      const byKind = new Map<string, { n: number; bytes: number }>();
      for (const f of fonts) {
        const t = byKind.get(f.kind) ?? { n: 0, bytes: 0 };
        t.n++;
        t.bytes += f.bytes;
        byKind.set(f.kind, t);
      }
      console.log(`  fuentes por tipo: ${[...byKind.entries()].map(([k, v]) => `${k}×${v.n} ${formatBytes(v.bytes)}`).join(" · ")}`);
      for (const f of fonts.slice(0, 8)) {
        console.log(`    ${formatBytes(f.bytes).padStart(9)}  ${f.kind.padEnd(14)} ${f.subset ? "subset " : "COMPLETA"} ${f.name}`);
      }
      if (fonts.length > 8) console.log(`    … ${fonts.length - 8} fuentes más`);
    }
    doc.destroy();
  }
}

function rawLength(ref: PDFObject): number {
  try {
    const raw = ref.readRawStream();
    try {
      return raw.getLength();
    } finally {
      raw.destroy();
    }
  } catch {
    try {
      return ref.get("Length").asNumber();
    } catch {
      return 0;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
