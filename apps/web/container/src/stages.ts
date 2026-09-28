/** Etapas con binarios externos: Ghostscript, ocrmypdf, qpdf. Procesos cancelables y con timeout. */
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import type { PresetDefinition } from "@prensa/schema";

export class StageError extends Error {}

const STAGE_TIMEOUT_MS = 50 * 60 * 1000;

export async function run(cmd: string, args: string[], signal: AbortSignal, onLine?: (line: string) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Cancelado", "AbortError"));
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
    let stderr = "";
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      kill();
      reject(new StageError(`${cmd} superó los ${STAGE_TIMEOUT_MS / 60000} minutos`));
    }, STAGE_TIMEOUT_MS);
    const onAbort = () => {
      clearTimeout(timer);
      kill();
      reject(new DOMException("Cancelado", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d: Buffer) => {
      if (onLine) for (const line of d.toString().split("\n")) if (line.trim()) onLine(line);
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
      if (onLine) for (const line of d.toString().split("\n")) if (line.trim()) onLine(line);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) return reject(new DOMException("Cancelado", "AbortError"));
      if (code === 0) resolve();
      else reject(new StageError(`${cmd} terminó con código ${code}: ${stderr.trim().split("\n").slice(-3).join(" | ")}`));
    });
  });
}

export async function hasTool(cmd: string): Promise<boolean> {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    try {
      await access(`${dir}/${cmd}`);
      return true;
    } catch {
      /* siguiente */
    }
  }
  return false;
}

export interface OcrOptions {
  languages: string[];
  mode: "skip-text" | "force";
  deskew: boolean;
  rotate: boolean;
  /** true = optimizar imágenes con ocrmypdf (JBIG2 con jbig2enc + pngquant) */
  optimize: boolean;
  /** false = solo optimizar, sin reconocer texto */
  recognize: boolean;
}

export async function ocrmypdf(input: string, output: string, o: OcrOptions, signal: AbortSignal, onLine?: (l: string) => void): Promise<void> {
  const args = ["-l", o.languages.join("+"), "--output-type", "pdf", "--jobs", "2", "--optimize", o.optimize ? "3" : "0"];
  if (o.recognize) args.push(o.mode === "force" ? "--force-ocr" : "--skip-text");
  else args.push("--tesseract-timeout", "0", "--skip-text");
  if (o.deskew) args.push("--deskew");
  if (o.rotate) args.push("--rotate-pages");
  args.push(input, output);
  await run("ocrmypdf", args, signal, onLine);
}

/** Reescritura completa con Ghostscript pdfwrite (aplana formularios; útil para PDFs patológicos). */
export async function ghostscriptRewrite(input: string, output: string, p: PresetDefinition, gray: boolean, signal: AbortSignal, onLine?: (l: string) => void): Promise<void> {
  const dpi = p.colorDpi ?? 150;
  const q = p.photoQuality ?? 80;
  const args = [
    "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.7", "-dNOPAUSE", "-dBATCH", "-dSAFER",
    "-dDetectDuplicateImages=true", "-dCompressFonts=true", "-dSubsetFonts=true", "-dEmbedAllFonts=true",
    `-dColorImageResolution=${dpi}`, `-dGrayImageResolution=${dpi}`, `-dMonoImageResolution=${p.monoDpi ?? 400}`,
    "-dDownsampleColorImages=true", "-dDownsampleGrayImages=true", "-dDownsampleMonoImages=true",
    "-dColorImageDownsampleType=/Bicubic", "-dGrayImageDownsampleType=/Bicubic", "-dMonoImageDownsampleType=/Subsample",
    "-dColorImageDownsampleThreshold=1.0", "-dGrayImageDownsampleThreshold=1.0", "-dMonoImageDownsampleThreshold=1.0",
    "-dAutoFilterColorImages=false", "-dAutoFilterGrayImages=false", "-dColorImageFilter=/DCTEncode", "-dGrayImageFilter=/DCTEncode",
    "-dPassThroughJPEGImages=false", `-dJPEGQ=${q}`,
  ];
  if (gray) args.push("-sColorConversionStrategy=Gray", "-sProcessColorModel=DeviceGray", "-dOverrideICC=true");
  args.push(`-sOutputFile=${output}`, input);
  await run("gs", args, signal, onLine);
}

/** Rasterizado con Ghostscript (cada página → imagen). El motor TS lo recomprime después. */
export async function ghostscriptRasterize(input: string, output: string, dpi: number, gray: boolean, signal: AbortSignal, onLine?: (l: string) => void): Promise<void> {
  await run("gs", [`-sDEVICE=${gray ? "pdfimage8" : "pdfimage24"}`, "-dNOPAUSE", "-dBATCH", "-dQUIET", "-dSAFER", `-r${dpi}`, `-sOutputFile=${output}`, input], signal, onLine);
}

export async function qpdfLinearize(input: string, output: string, signal: AbortSignal): Promise<void> {
  await run("qpdf", ["--linearize", "--warning-exit-0", input, output], signal);
}

export async function qpdfCheck(file: string, signal: AbortSignal): Promise<"ok" | "warn" | "fail"> {
  try {
    await run("qpdf", ["--check", file], signal);
    return "ok";
  } catch (err) {
    if (err instanceof StageError && /código 3/.test(err.message)) return "warn";
    if (err instanceof DOMException) throw err;
    return "fail";
  }
}
