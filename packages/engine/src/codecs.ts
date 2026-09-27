/**
 * Códecs de imagen (WASM): mozjpeg (@jsquash/jpeg) y redimensionado Lanczos
 * (@jsquash/resize). En el navegador localizan su .wasm con import.meta.url;
 * en Node el adaptador (node.ts) pasa los módulos compilados desde disco.
 */
import encodeJpegRaw, { init as initJpegEncoder } from "@jsquash/jpeg/encode";
import resizeRaw, { initResize } from "@jsquash/resize";
import type { RgbaImage } from "./images/types";

export interface CodecModules {
  jpegEncoder?: WebAssembly.Module;
  resize?: BufferSource | WebAssembly.Module;
}

let ready: Promise<void> | null = null;

export function initCodecs(modules: CodecModules = {}): Promise<void> {
  ready ??= (async () => {
    await Promise.all([
      modules.jpegEncoder ? initJpegEncoder(modules.jpegEncoder) : initJpegEncoder(),
      initResize(modules.resize),
    ]);
  })();
  return ready;
}

export interface JpegEncodeOptions {
  quality: number;
  grayscale: boolean;
  /** 1 = 4:4:4, 2 = 4:2:0 */
  chromaSubsample: 1 | 2;
  progressive?: boolean;
}

export async function encodeJpeg(img: RgbaImage, o: JpegEncodeOptions): Promise<Uint8Array> {
  await initCodecs();
  const buf = await encodeJpegRaw(img as ImageData, {
    quality: o.quality,
    baseline: false,
    arithmetic: false,
    progressive: o.progressive ?? false,
    optimize_coding: true,
    smoothing: 0,
    // 1 = GRAYSCALE, 3 = YCbCr (ver MozJpegColorSpace)
    color_space: o.grayscale ? 1 : 3,
    quant_table: 3,
    trellis_multipass: false,
    trellis_opt_zero: false,
    trellis_opt_table: false,
    trellis_loops: 1,
    auto_subsample: false,
    chroma_subsample: o.grayscale ? 1 : o.chromaSubsample,
    separate_chroma_quality: false,
    chroma_quality: o.quality,
  });
  return new Uint8Array(buf);
}

export async function resizeRgba(img: RgbaImage, width: number, height: number): Promise<RgbaImage> {
  await initCodecs();
  const out = await resizeRaw(img as ImageData, {
    width,
    height,
    method: "lanczos3",
    fitMethod: "stretch",
    premultiply: false,
    linearRGB: false,
  });
  return { data: out.data, width: out.width, height: out.height };
}
