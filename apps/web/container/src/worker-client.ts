/** Cliente del contenedor hacia el Worker: objetos de R2 y reportes de estado. */
import { createReadStream, createWriteStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { CompressionResult, Stage } from "@prensa/schema";
import { z } from "zod";

const PART_SIZE = 32 * 1024 * 1024;
const UploadInit = z.object({ uploadId: z.string() });
const UploadedPart = z.object({ partNumber: z.number().int(), etag: z.string() });

export class WorkerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Bearer ${this.secret}`, ...extra };
  }

  async download(key: string, dest: string, signal: AbortSignal): Promise<number> {
    const res = await fetch(`${this.baseUrl}/internal/objects/${encodeURI(key)}`, { headers: this.headers(), signal });
    if (!res.ok || !res.body) throw new Error(`descarga falló: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), createWriteStream(dest), { signal });
    return (await stat(dest)).size;
  }

  async upload(key: string, file: string, signal: AbortSignal, onProgress?: (fraction: number) => void): Promise<void> {
    const size = (await stat(file)).size;
    const init = await fetch(`${this.baseUrl}/internal/multipart`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ key }),
      signal,
    });
    if (!init.ok) throw new Error(`no se pudo iniciar la subida: HTTP ${init.status}`);
    const { uploadId } = UploadInit.parse(await init.json());
    const parts: Array<{ partNumber: number; etag: string }> = [];
    const handle = await open(file, "r");
    try {
      const total = Math.max(1, Math.ceil(size / PART_SIZE));
      for (let n = 1; n <= total; n++) {
        const offset = (n - 1) * PART_SIZE;
        const length = Math.min(PART_SIZE, size - offset);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, offset);
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(`${this.baseUrl}/internal/multipart/${uploadId}/parts/${n}?key=${encodeURIComponent(key)}`, {
              method: "PUT",
              headers: this.headers({ "content-type": "application/octet-stream", "content-length": String(length) }),
              body: buffer,
              signal,
            });
            if (!res.ok) throw new Error(`parte ${n}: HTTP ${res.status}`);
            parts.push(UploadedPart.parse(await res.json()));
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            if (signal.aborted) throw err;
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }
        if (lastErr) throw lastErr instanceof Error ? lastErr : new Error(`parte ${n}: fallo desconocido`);
        onProgress?.(n / total);
      }
    } finally {
      await handle.close();
    }
    const done = await fetch(`${this.baseUrl}/internal/multipart/${uploadId}/complete`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ key, parts }),
      signal,
    });
    if (!done.ok) throw new Error(`no se pudo completar la subida: HTTP ${done.status}`);
  }

  async progress(jobId: string, stage: Stage, progress: number, message?: string): Promise<void> {
    await this.post(`/internal/jobs/${jobId}/progress`, { stage, progress, message }).catch(() => undefined);
  }

  async done(jobId: string, result: CompressionResult, outputKey: string): Promise<void> {
    await this.post(`/internal/jobs/${jobId}/done`, { result, outputKey });
  }

  async failed(jobId: string, error: string): Promise<void> {
    await this.post(`/internal/jobs/${jobId}/failed`, { error }).catch(() => undefined);
  }

  private async post(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  }
}

export { createReadStream };
