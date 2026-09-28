/**
 * Corre un PDF por la nube de Prensa desde la terminal (misma API que usa la
 * app): subida multipart → trabajo → progreso → descarga. Sirve para probar
 * archivos gigantes sin pasar por el navegador.
 *
 *   pnpm exec tsx tools/bench/cloud-run.ts archivo.pdf [--base https://pdf.cdc.cool] [--preset smart] [--ocr spa]
 */
import { createWriteStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CompressionSpec, JobState, UploadInitResponse, formatBytes, type PresetId } from "@prensa/schema";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const file = process.argv[2] ?? "";
if (!file || file.startsWith("--")) throw new Error("uso: cloud-run.ts archivo.pdf [--base URL] [--preset id] [--ocr lang]");
const BASE = (arg("base", "https://pdf.cdc.cool") as string).replace(/\/$/, "");
const preset = arg("preset", "smart") as PresetId;
const ocr = arg("ocr");
const PARALLEL = 2;
const RETRIES = 3;

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.url}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

async function uploadPart(fh: Awaited<ReturnType<typeof open>>, init: UploadInitResponse, n: number, offset: number, len: number) {
  const buf = Buffer.alloc(len);
  await fh.read(buf, 0, len, offset);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/uploads/${init.uploadId}/parts/${n}?key=${encodeURIComponent(init.key)}`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream", "content-length": String(len) },
        body: buf,
      });
      return await json<{ partNumber: number; etag: string }>(res);
    } catch (err) {
      if (attempt >= RETRIES) throw err;
      console.log(`  parte ${n}: reintento ${attempt} (${err instanceof Error ? err.message : String(err)})`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function main() {
  const size = (await stat(file)).size;
  const fileName = path.basename(file);
  const t0 = performance.now();
  console.log(`→ ${fileName} (${formatBytes(size)}) → ${BASE} · preset ${preset}${ocr ? ` · OCR ${ocr}` : ""}`);

  const init = UploadInitResponse.parse(
    await json(await fetch(`${BASE}/api/uploads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName, size }) })),
  );
  const partCount = Math.ceil(size / init.partSize);
  console.log(`  subida ${init.uploadId.slice(0, 8)}… en ${partCount} partes de ${formatBytes(init.partSize)}`);

  const fh = await open(file, "r");
  const parts: { partNumber: number; etag: string }[] = [];
  let next = 1;
  let uploaded = 0;
  const workers = Array.from({ length: Math.min(PARALLEL, partCount) }, async () => {
    while (next <= partCount) {
      const n = next++;
      const offset = (n - 1) * init.partSize;
      const len = Math.min(init.partSize, size - offset);
      parts.push(await uploadPart(fh, init, n, offset, len));
      uploaded += len;
      const secs = (performance.now() - t0) / 1000;
      console.log(`  ${((100 * uploaded) / size).toFixed(0).padStart(3)} %  ${formatBytes(uploaded)}  ${formatBytes(uploaded / secs)}/s`);
    }
  });
  await Promise.all(workers);
  await fh.close();

  const done = await json<{ key: string; size: number }>(
    await fetch(`${BASE}/api/uploads/${init.uploadId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: init.key, parts }),
    }),
  );
  console.log(`  subida completa (${formatBytes(done.size)}) en ${((performance.now() - t0) / 1000).toFixed(0)} s`);

  const spec = CompressionSpec.parse({
    preset,
    cloud: { enabled: true, ...(ocr ? { ocr: { enabled: true, languages: [ocr] } } : {}) },
  });
  let state = JobState.parse(
    await json(
      await fetch(`${BASE}/api/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uploadKey: done.key, fileName, inputSize: done.size, spec }),
      }),
    ),
  );
  console.log(`  trabajo ${state.id} · cola ${state.position ?? "-"}`);

  let last = "";
  const tJob = performance.now();
  while (state.status === "queued" || state.status === "running") {
    await new Promise((r) => setTimeout(r, 3000));
    state = JobState.parse(await json(await fetch(`${BASE}/api/jobs/${state.id}`)));
    const line = `${state.status} ${state.stage ?? ""} ${(state.progress * 100).toFixed(0)}% ${state.message ?? ""}`.trim();
    if (line !== last) {
      console.log(`  [${((performance.now() - tJob) / 1000).toFixed(0).padStart(4)} s] ${line}`);
      last = line;
    }
    if (performance.now() - tJob > 60 * 60_000) throw new Error("timeout 60 min");
  }
  if (state.status !== "done" || !state.downloadUrl) {
    console.log(`✗ ${state.status}: ${state.error ?? "sin detalle"}`);
    process.exit(2);
  }
  const r = state.result!;
  console.log(`✓ listo en ${((performance.now() - tJob) / 1000).toFixed(0)} s: ${formatBytes(r.originalSize)} → ${formatBytes(r.outputSize)} (−${(100 * r.savings).toFixed(1)} %)`);
  for (const note of r.notes) console.log(`  · ${note}`);
  const out = path.join("tools/bench/out", `cloud-${state.outputName ?? fileName}`);
  const res = await fetch(`${BASE}${state.downloadUrl}`);
  if (!res.ok || !res.body) throw new Error(`descarga ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(out));
  console.log(`  descargado → ${out} (${formatBytes((await stat(out)).size)})`);
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
