/**
 * Adaptador Node (tests, benchmark, motor en la nube): inicializa los códecs
 * WASM desde disco y define ImageData, que no existe fuera del navegador.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { CompressionSpecInput } from "@prensa/schema";
import { analyzeDocument, type AnalysisContext } from "./analyze";
import { initCodecs } from "./codecs";
import { openDocument, type CompressOptions, type CompressOutput } from "./compress";
import { compressToTarget } from "./target";
import { loadMupdf, type Mu } from "./mupdf";

class NodeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace = "srgb";
  constructor(data: Uint8ClampedArray | number, width: number, height?: number) {
    if (typeof data === "number") {
      this.width = data;
      this.height = width;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = data;
      this.width = width;
      this.height = height ?? data.length / 4 / width;
    }
  }
}

let ready: Promise<Mu> | null = null;

export function initNodeEngine(): Promise<Mu> {
  ready ??= (async () => {
    if (!("ImageData" in globalThis)) {
      (globalThis as unknown as { ImageData: unknown }).ImageData = NodeImageData;
    }
    const require = createRequire(import.meta.url);
    // En el contenedor el runner va empaquetado y los .wasm se copian al lado del bundle.
    const locate = (sibling: string, pkgPath: string) => {
      const local = fileURLToPath(new URL(`./${sibling}`, import.meta.url));
      return existsSync(local) ? local : require.resolve(pkgPath);
    };
    const [jpegWasm, resizeWasm] = await Promise.all([
      readFile(locate("mozjpeg_enc.wasm", "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm")),
      readFile(locate("squoosh_resize_bg.wasm", "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm")),
    ]);
    await initCodecs({ jpegEncoder: await WebAssembly.compile(jpegWasm), resize: resizeWasm });
    return loadMupdf();
  })();
  return ready;
}

export async function analyzeBytes(bytes: Uint8Array, fileName: string, password?: string): Promise<AnalysisContext> {
  const mupdf = await initNodeEngine();
  const doc = openDocument(mupdf, bytes, password);
  try {
    return analyzeDocument(mupdf, doc, fileName, bytes.length);
  } finally {
    doc.destroy();
  }
}

export async function compressBytes(
  bytes: Uint8Array,
  spec: CompressionSpecInput,
  opts: Omit<CompressOptions, "fileName"> & { fileName?: string },
): Promise<CompressOutput> {
  const mupdf = await initNodeEngine();
  return compressToTarget(mupdf, bytes, spec, { ...opts, fileName: opts.fileName ?? "documento.pdf" });
}

export async function analyzeFile(path: string, password?: string): Promise<AnalysisContext> {
  const bytes = new Uint8Array(await readFile(path));
  return analyzeBytes(bytes, path.split("/").pop() ?? path, password);
}

export async function compressFile(path: string, spec: CompressionSpecInput, opts: Omit<CompressOptions, "fileName"> = {}): Promise<CompressOutput> {
  const bytes = new Uint8Array(await readFile(path));
  return compressBytes(bytes, spec, { ...opts, fileName: path.split("/").pop() ?? path });
}
