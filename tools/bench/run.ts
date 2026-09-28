/**
 * Benchmark del motor: corre cada preset sobre el corpus y reporta tamaño,
 * ahorro, tiempo, fidelidad (SSIM de página), texto e interactividad.
 *
 *   pnpm bench                      # todo el corpus, presets principales
 *   pnpm bench -- --preset screen   # un preset
 *   pnpm bench -- --file informe    # filtra por nombre
 *
 * Corpus: tools/bench/corpus/*.pdf (no versionado). Salida: tools/bench/out/report.md
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compressBytes, initNodeEngine } from "@prensa/engine/node";
import { PRESET_IDS, defaultSpec, formatBytes, type PresetId } from "@prensa/schema";

const ROOT = path.resolve(import.meta.dirname);
const CORPUS = path.join(ROOT, "corpus");
const OUT = path.join(ROOT, "out");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const presetArg = arg("preset");
const fileFilter = arg("file");
const presets: PresetId[] = presetArg
  ? [presetArg as PresetId]
  : (["smart", "balanced", "screen", "print", "lossless"] satisfies PresetId[]);
if (presetArg && !PRESET_IDS.includes(presetArg as PresetId)) throw new Error(`preset desconocido: ${presetArg}`);

function qpdfCheck(file: string): string {
  try {
    execFileSync("qpdf", ["--check", file], { stdio: "pipe" });
    return "ok";
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer };
    if (e.status === 3) return "warn"; // qpdf: warnings pero legible
    if (/ENOENT/.test(String(err))) return "n/a";
    return "FAIL";
  }
}

interface Row {
  file: string;
  preset: PresetId;
  inBytes: number;
  outBytes: number;
  savings: number;
  ms: number;
  ssim: number | null;
  textOk: boolean;
  interOk: boolean;
  images: string;
  qpdf: string;
  returnedOriginal: boolean;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await initNodeEngine();
  const files = readdirSync(CORPUS)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .filter((f) => !fileFilter || f.includes(fileFilter))
    .sort();
  if (files.length === 0) {
    console.error(`No hay PDFs en ${CORPUS}`);
    process.exit(1);
  }
  const rows: Row[] = [];
  for (const file of files) {
    const input = new Uint8Array(readFileSync(path.join(CORPUS, file)));
    for (const preset of presets) {
      const t0 = performance.now();
      let res;
      try {
        res = await compressBytes(input, defaultSpec(preset), { fileName: file });
      } catch (err) {
        console.log(`${file.padEnd(28)} ${preset.padEnd(9)} ERROR ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      const ms = Math.round(performance.now() - t0);
      const outFile = path.join(OUT, `${file.replace(/\.pdf$/i, "")}.${preset}.pdf`);
      writeFileSync(outFile, res.bytes);
      const recompressed = res.images.filter((i) => i.action === "recompressed" || i.action === "downsampled").length;
      const row: Row = {
        file,
        preset,
        inBytes: input.length,
        outBytes: res.bytes.length,
        savings: res.result.savings,
        ms,
        ssim: res.result.verification.pageSsimMin,
        textOk: res.result.verification.textOk,
        interOk: res.result.verification.interactivityOk,
        images: `${recompressed}/${res.images.length}`,
        qpdf: qpdfCheck(outFile),
        returnedOriginal: res.result.returnedOriginal,
      };
      rows.push(row);
      console.log(
        `${file.padEnd(28)} ${preset.padEnd(9)} ${formatBytes(row.inBytes).padStart(10)} → ${formatBytes(row.outBytes).padStart(10)}  ${(row.savings * 100).toFixed(1).padStart(5)}%  ${String(ms).padStart(6)} ms  ssim=${row.ssim?.toFixed(3) ?? "  -  "}  text=${row.textOk ? "ok" : "X"}  inter=${row.interOk ? "ok" : "X"}  img=${row.images}  qpdf=${row.qpdf}${row.returnedOriginal ? "  (original)" : ""}`,
      );
    }
  }
  const md = [
    `# Benchmark · ${new Date().toISOString()}`,
    "",
    "| Archivo | Preset | Entrada | Salida | Ahorro | Tiempo | SSIM pág. | Texto | Interact. | Imágenes | qpdf |",
    "|---|---|---:|---:|---:|---:|---:|:-:|:-:|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.file} | ${r.preset} | ${formatBytes(r.inBytes)} | ${formatBytes(r.outBytes)} | ${(r.savings * 100).toFixed(1)} % | ${r.ms} ms | ${r.ssim?.toFixed(3) ?? "—"} | ${r.textOk ? "✓" : "✗"} | ${r.interOk ? "✓" : "✗"} | ${r.images} | ${r.qpdf}${r.returnedOriginal ? " (original)" : ""} |`,
    ),
    "",
  ].join("\n");
  writeFileSync(path.join(OUT, "report.md"), md);
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(rows, null, 2));
  console.log(`\nReporte: ${path.join(OUT, "report.md")}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
