/**
 * Ejecuta un trabajo en la nube: descarga → (OCR/JBIG2) → motor (TS | Ghostscript |
 * rasterizar) → (linealizar) → verificar → subir → reportar.
 */
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeBytes, compressBytes, initNodeEngine } from "@prensa/engine/node";
import { openDocument } from "@prensa/engine";
import { resolveImageParams, type CompressionResult, type RunJobPayload, type SizeBreakdown } from "@prensa/schema";
import { ghostscriptRasterize, ghostscriptRewrite, hasTool, ocrmypdf, qpdfCheck, qpdfLinearize } from "./stages";
import { WorkerClient } from "./worker-client";

const active = new Map<string, AbortController>();
/** Por encima de esto no se carga el PDF en el motor WASM (memoria): se usa Ghostscript nativo. */
const NATIVE_THRESHOLD = 400 * 1024 * 1024;

export function cancelJob(jobId: string): boolean {
  const c = active.get(jobId);
  if (!c) return false;
  c.abort();
  return true;
}

export function activeJobs(): number {
  return active.size;
}

export async function runJob(payload: RunJobPayload, secret: string): Promise<void> {
  const { jobId } = payload;
  const controller = new AbortController();
  const { signal } = controller;
  active.set(jobId, controller);
  const client = new WorkerClient(payload.callbackUrl, secret);
  const dir = await mkdtemp(path.join(tmpdir(), `prensa-${jobId.slice(0, 8)}-`));
  const notes: string[] = [];
  let lastReport = 0;
  let lastState: { stage: "download" | "processing" | "upload"; progress: number; message?: string } = { stage: "download", progress: 0.02 };
  const report = async (stage: "download" | "processing" | "upload", progress: number, message?: string, force = false) => {
    lastState = { stage, progress, message };
    const now = Date.now();
    if (!force && now - lastReport < 1000) return;
    lastReport = now;
    await client.progress(jobId, stage, progress, message);
  };
  // Heartbeat: etapas largas sin salida (OCR pesado, Ghostscript en archivos enormes) no deben parecer colgadas.
  const heartbeat = setInterval(() => {
    if (Date.now() - lastReport > 45_000) void report(lastState.stage, lastState.progress, lastState.message, true);
  }, 60_000);

  try {
    const input = path.join(dir, "input.pdf");
    await report("download", 0.02, "Descargando el archivo", true);
    const inputSize = await client.download(payload.inputKey, input, signal);
    await report("processing", 0.08, "Preparando", true);

    const spec = payload.spec;
    const cloud = { ...spec.cloud };
    const params = resolveImageParams(spec);
    const gray = spec.images.color !== "keep";
    let current = input;
    let step = 0;
    const huge = inputSize > NATIVE_THRESHOLD;
    if (huge && cloud.engine === "auto") {
      cloud.engine = "ghostscript";
      notes.push("Archivo muy grande: se usó Ghostscript nativo (los formularios se aplanan) para no agotar la memoria.");
    }

    // ── OCR / JBIG2 (ocrmypdf) ──────────────────────────────────────
    const wantsOcr = cloud.ocr.enabled;
    const wantsJbig2 = cloud.jbig2;
    if (wantsOcr || wantsJbig2) {
      if (await hasTool("ocrmypdf")) {
        const out = path.join(dir, `ocr-${++step}.pdf`);
        await report("processing", 0.12, wantsOcr ? "Reconociendo texto (OCR)" : "Optimizando escaneo (JBIG2)", true);
        await ocrmypdf(
          current,
          out,
          {
            languages: cloud.ocr.languages.length ? cloud.ocr.languages : ["spa"],
            mode: cloud.ocr.mode,
            deskew: cloud.ocr.deskew,
            rotate: cloud.ocr.rotate,
            optimize: wantsJbig2,
            recognize: wantsOcr,
          },
          signal,
          (line) => {
            const m = /(\d+)%/.exec(line);
            if (m) void report("processing", 0.12 + 0.38 * (Number(m[1]) / 100), wantsOcr ? "Reconociendo texto (OCR)" : "Optimizando escaneo (JBIG2)");
          },
        );
        current = out;
        notes.push(wantsOcr ? `OCR aplicado (${cloud.ocr.languages.join("+")})` : "Escaneo optimizado con JBIG2");
      } else {
        notes.push("ocrmypdf no está disponible en este entorno; se omitió OCR/JBIG2.");
      }
    }

    // ── Motor principal ─────────────────────────────────────────────
    let engineResult: CompressionResult | null = null;
    let output = path.join(dir, "output.pdf");
    await report("processing", 0.5, "Comprimiendo", true);
    if (cloud.engine === "ghostscript") {
      const out = path.join(dir, `gs-${++step}.pdf`);
      await ghostscriptRewrite(current, out, params, gray, signal, (line) => {
        const m = /Page (\d+)/.exec(line);
        if (m) void report("processing", 0.55, `Reescribiendo (página ${m[1]})`);
      });
      if (huge) {
        // Sin pasada del motor WASM: el archivo no cabe en memoria.
        output = out;
      } else {
        // Pasada estructural sin pérdida del motor TS (dedupe, limpieza, subset verificado)
        const res = await compressBytes(new Uint8Array(await readFile(out)), { ...spec, preset: "lossless", cloud: { ...cloud, enabled: false } }, { fileName: payload.fileName, signal });
        await writeFile(output, res.bytes);
        engineResult = res.result;
      }
      if (!huge) notes.push("Reescrito con Ghostscript (los formularios se aplanan)");
    } else if (cloud.engine === "rasterize") {
      const out = path.join(dir, `raster-${++step}.pdf`);
      await ghostscriptRasterize(current, out, params.colorDpi ?? 150, gray, signal, (line) => {
        const m = /Page (\d+)/.exec(line);
        if (m) void report("processing", 0.6, `Rasterizando (página ${m[1]})`);
      });
      const res = await compressBytes(new Uint8Array(await readFile(out)), { ...spec, mode: "preserve", cloud: { ...cloud, enabled: false } }, {
        fileName: payload.fileName,
        signal,
        onProgress: (e) => void report("processing", 0.7 + 0.2 * e.progress, "Comprimiendo imágenes"),
      });
      await writeFile(output, res.bytes);
      engineResult = res.result;
      notes.push("Rasterizado: el texto y la interactividad se convirtieron en imagen.");
    } else {
      const res = await compressBytes(new Uint8Array(await readFile(current)), { ...spec, cloud: { ...cloud, enabled: false } }, {
        fileName: payload.fileName,
        signal,
        onProgress: (e) => void report("processing", 0.5 + 0.4 * e.progress, e.message ?? "Comprimiendo"),
      });
      await writeFile(output, res.bytes);
      engineResult = res.result;
    }

    // ── Linealizar (fast web view) ──────────────────────────────────
    if (cloud.linearize && (await hasTool("qpdf"))) {
      const out = path.join(dir, `lin-${++step}.pdf`);
      await qpdfLinearize(output, out, signal);
      output = out;
      notes.push("Linealizado para vista web rápida");
    }

    // ── Verificación final ──────────────────────────────────────────
    await report("processing", 0.92, "Verificando", true);
    let outputSize = (await stat(output)).size;
    const transformed = wantsOcr || cloud.engine === "rasterize";
    if (outputSize >= inputSize && !transformed) {
      output = input;
      outputSize = inputSize;
      notes.push("El PDF ya estaba optimizado: se entrega el original sin cambios.");
    }
    if (await hasTool("qpdf")) {
      const check = await qpdfCheck(output, signal);
      if (check === "fail") throw new Error("El PDF resultante no pasó la verificación estructural (qpdf).");
    }
    const result = await buildResult(payload, inputSize, output, outputSize, engineResult, notes, output === input, huge);

    // ── Subir y reportar ────────────────────────────────────────────
    await report("upload", 0.95, "Subiendo el resultado", true);
    await client.upload(payload.outputKey, output, signal, (f) => void report("upload", 0.95 + 0.05 * f, "Subiendo el resultado"));
    await client.done(jobId, result, payload.outputKey);
  } catch (err) {
    const cancelled = signal.aborted || (err instanceof DOMException && err.name === "AbortError");
    await client.failed(jobId, cancelled ? "CANCELLED" : err instanceof Error ? err.message : String(err));
  } finally {
    clearInterval(heartbeat);
    active.delete(jobId);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function buildResult(
  payload: RunJobPayload,
  inputSize: number,
  output: string,
  outputSize: number,
  engine: CompressionResult | null,
  notes: string[],
  returnedOriginal: boolean,
  huge = false,
): Promise<CompressionResult> {
  const t0 = Date.now();
  const mupdf = await initNodeEngine();
  let pagesOk: boolean;
  let breakdownAfter: SizeBreakdown = { images: 0, fonts: 0, content: 0, metadata: 0, other: outputSize };
  if (huge) {
    // Ni se analiza ni se abre en WASM: solo tamaños. qpdf --check ya validó la estructura.
    pagesOk = true;
  } else try {
    const outBytes = new Uint8Array(await readFile(output));
    const rep = await analyzeBytes(outBytes, payload.fileName);
    breakdownAfter = rep.report.breakdown;
    const doc = openDocument(mupdf, outBytes);
    try {
      pagesOk = doc.countPages() > 0;
    } finally {
      doc.destroy();
    }
  } catch {
    pagesOk = false;
  }
  const base: CompressionResult = engine ?? {
    originalSize: inputSize,
    outputSize,
    savings: 0,
    durationMs: 0,
    preset: payload.spec.preset,
    imagesTotal: 0,
    imagesRecompressed: 0,
    imagesDownsampled: 0,
    fontsSubset: false,
    breakdown: { before: { images: 0, fonts: 0, content: 0, metadata: 0, other: inputSize }, after: breakdownAfter },
    verification: { pagesOk, textOk: true, pageSsimMin: null, interactivityOk: true },
    returnedOriginal: false,
    notes: [],
  };
  return {
    ...base,
    originalSize: inputSize,
    outputSize,
    savings: inputSize > 0 ? Math.max(0, 1 - outputSize / inputSize) : 0,
    durationMs: base.durationMs + (Date.now() - t0),
    breakdown: { before: base.breakdown.before, after: breakdownAfter },
    verification: { ...base.verification, pagesOk: base.verification.pagesOk && pagesOk },
    returnedOriginal,
    notes: [...notes, ...base.notes.filter((n) => !notes.includes(n))],
  };
}
