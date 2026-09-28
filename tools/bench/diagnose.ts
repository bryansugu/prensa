/**
 * Diagnóstico de un PDF concreto: qué ve el análisis y qué decide el motor
 * por cada imagen. Para entender por qué un archivo no baja (o baja poco).
 *
 *   pnpm exec tsx tools/bench/diagnose.ts archivo.pdf [--preset smart]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analyzeBytes, compressBytes } from "@prensa/engine/node";
import { defaultSpec, formatBytes, type PresetId } from "@prensa/schema";

const file = process.argv[2];
if (!file) throw new Error("uso: diagnose.ts archivo.pdf [--preset id]");
const presetIdx = process.argv.indexOf("--preset");
const preset = (presetIdx >= 0 ? process.argv[presetIdx + 1] : "smart") as PresetId;

function count<T extends string | number>(items: T[]): string {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${String(k)}×${v}`)
    .join(" · ");
}

async function main() {
  const bytes = new Uint8Array(readFileSync(file!));
  const { report } = await analyzeBytes(bytes, path.basename(file!));
  console.log(`\n${path.basename(file!)} — ${formatBytes(bytes.length)} · ${report.pageCount} págs · tipo ${report.docType} · texto en ${report.textPages} págs`);
  console.log("desglose:", Object.entries(report.breakdown).map(([k, v]) => `${k} ${formatBytes(v)}`).join(" · "));
  console.log("features:", Object.entries(report.features).filter(([, v]) => v === true || (typeof v === "number" && v > 0)).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(", ") || "—");
  const imgs = report.images;
  console.log(`\nimágenes: ${imgs.length} · ${formatBytes(imgs.reduce((a, i) => a + i.bytes, 0))}`);
  if (imgs.length) {
    console.log("  filtro:", count(imgs.map((i) => i.filter ?? "none")));
    console.log("  espacio:", count(imgs.map((i) => `${i.colorSpace}/${i.components}c/${i.bitsPerComponent}b`)));
    console.log("  tipo:", count(imgs.map((i) => i.kind)));
    console.log("  máscaras:", count(imgs.map((i) => (i.hasSoftMask ? "smask" : i.isStencilMask ? "stencil" : "sin"))));
    const dpis = imgs.map((i) => i.effectiveDpi).filter((d): d is number => d != null);
    console.log("  dpi efectivo:", dpis.length ? `min ${Math.round(Math.min(...dpis))} · mediana ${Math.round(dpis.sort((a, b) => a - b)[Math.floor(dpis.length / 2)]!)} · max ${Math.round(Math.max(...dpis))} · sin dpi ${imgs.length - dpis.length}` : "ninguno");
    console.log("  10 más pesadas:");
    for (const i of [...imgs].sort((a, b) => b.bytes - a.bytes).slice(0, 10)) {
      console.log(`    obj ${String(i.objectNumber).padStart(5)}  ${formatBytes(i.bytes).padStart(9)}  ${i.width}×${i.height} ${i.filter ?? "raw"} ${i.colorSpace}/${i.bitsPerComponent}b ${i.kind} dpi=${i.effectiveDpi != null ? Math.round(i.effectiveDpi) : "?"}${i.hasSoftMask ? " +smask" : ""}`);
    }
  }
  console.log("\nestimaciones:", Object.entries(report.estimates).map(([k, v]) => `${k} ${formatBytes(v.bytes)}`).join(" · "));

  const t0 = performance.now();
  const out = await compressBytes(bytes, defaultSpec(preset), { fileName: path.basename(file!) });
  const r = out.result;
  console.log(`\n${preset}: ${formatBytes(r.originalSize)} → ${formatBytes(r.outputSize)} (−${(r.savings * 100).toFixed(1)} %) en ${((performance.now() - t0) / 1000).toFixed(1)} s · original devuelto: ${r.returnedOriginal}`);
  console.log("verificación:", JSON.stringify(r.verification));
  for (const n of r.notes) console.log("  ·", n);
  console.log("imágenes:", count(out.images.map((o) => `${o.action}${o.reason ? `(${o.reason})` : ""}${o.codec ? `→${o.codec}` : ""}`)));
  const saved = out.images.reduce((a, o) => a + (o.beforeBytes - o.afterBytes), 0);
  console.log(`ahorro en imágenes: ${formatBytes(saved)} · después: ${Object.entries(r.breakdown.after).map(([k, v]) => `${k} ${formatBytes(v)}`).join(" · ")}`);
  const outPath = path.join("tools/bench/out", `diag-${path.basename(file!, ".pdf")}.${preset}.pdf`);
  writeFileSync(outPath, out.bytes);
  try {
    execFileSync("qpdf", ["--check", outPath], { stdio: "pipe" });
    console.log(`qpdf --check ok → ${outPath}`);
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer };
    console.log(`qpdf --check status ${e.status}: ${String(e.stderr ?? "").split("\n").slice(0, 5).join(" | ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
