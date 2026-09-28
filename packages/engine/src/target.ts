/**
 * "Objetivo de tamaño": prueba presets cada vez más agresivos hasta que el
 * resultado cabe en el límite pedido. Máximo 4 pasadas; si ninguna cabe, se
 * devuelve la más pequeña con una nota.
 */
import { PRESETS, type CompressionSpecInput, type PresetId } from "@prensa/schema";
import { compressPdf, type CompressOptions, type CompressOutput } from "./compress";
import type { Mu } from "./mupdf";

const LADDER: PresetId[] = ["maximum", "print", "balanced", "screen", "minimum"];

export async function compressToTarget(
  mupdf: Mu,
  input: Uint8Array,
  spec: CompressionSpecInput,
  opts: CompressOptions,
): Promise<CompressOutput> {
  const target = spec.output?.targetSizeBytes ?? null;
  if (!target) return compressPdf(mupdf, input, spec, opts);

  const start = spec.preset ?? "smart";
  const startIndex = start === "smart" || start === "lossless" ? LADDER.indexOf("balanced") : LADDER.indexOf(start);
  const attempts: PresetId[] = [start, ...LADDER.slice(Math.max(0, startIndex + 1))].filter((p, i, a) => a.indexOf(p) === i).slice(0, 4);

  let best: CompressOutput | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const preset = attempts[i]!;
    const out = await compressPdf(mupdf, input, { ...spec, preset, output: { ...spec.output, targetSizeBytes: null } }, {
      ...opts,
      onProgress: opts.onProgress
        ? (e) => opts.onProgress?.({ ...e, message: `Pasada ${i + 1}/${attempts.length} (${preset})${e.message ? ` · ${e.message}` : ""}` })
        : undefined,
    });
    if (!best || out.bytes.length < best.bytes.length) best = out;
    if (out.bytes.length <= target) {
      out.result.notes.push(`Objetivo de tamaño alcanzado en la pasada ${i + 1} con el preset ${preset}.`);
      return out;
    }
    if (out.result.returnedOriginal && preset !== "minimum" && PRESETS[preset].photoQuality == null) continue;
  }
  const final = best!;
  final.result.notes.push("No se alcanzó el objetivo de tamaño; se entrega el resultado más pequeño posible sin rasterizar.");
  return final;
}
