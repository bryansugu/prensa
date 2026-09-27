/** Cliente de la nube: subida reanudable por partes, trabajos y progreso por WebSocket. */
import { CloudConfig, JobState, UploadInitResponse, type CreateJobRequest } from "@prensa/schema";
import { z } from "zod";

const UploadedPart = z.object({ partNumber: z.number().int(), etag: z.string() });
const UploadCompleted = z.object({ key: z.string(), size: z.number().int() });

let configPromise: Promise<CloudConfig | null> | null = null;

export function fetchCloudConfig(): Promise<CloudConfig | null> {
  configPromise ??= fetch("/api/cloud/config")
    .then(async (r) => (r.ok ? CloudConfig.parse(await r.json()) : null))
    .catch(() => null);
  return configPromise;
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CloudError";
  }
}

async function readError(res: Response): Promise<CloudError> {
  const body = z
    .object({ error: z.string().optional(), message: z.string().optional() })
    .catch({})
    .parse(await res.json().catch(() => ({})));
  const code = body.error ?? `http_${res.status}`;
  const messages: Record<string, string> = {
    access_code_required: "La nube requiere un código de acceso. Escríbelo en Ajustes → Nube.",
    too_large: "El archivo supera el máximo permitido en la nube.",
    quota_exceeded: body.message ?? "Se alcanzó el límite diario de la nube.",
    not_a_pdf: "El archivo no es un PDF válido.",
    upload_not_found: "La subida expiró. Vuelve a intentarlo.",
  };
  return new CloudError(messages[code] ?? `Error de la nube (${code})`, code, res.status);
}

export interface UploadOptions {
  accessCode?: string | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: ((fraction: number) => void) | undefined;
}

/** Sube el archivo por partes (2 en paralelo, 3 reintentos por parte). Devuelve la clave en R2. */
export async function uploadToCloud(file: File, opts: UploadOptions = {}): Promise<{ key: string; size: number }> {
  const initRes = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size, accessCode: opts.accessCode }),
    signal: opts.signal,
  });
  if (!initRes.ok) throw await readError(initRes);
  const init = UploadInitResponse.parse(await initRes.json());
  const total = Math.max(1, Math.ceil(file.size / init.partSize));
  const parts: Array<{ partNumber: number; etag: string }> = [];
  const done = new Array<number>(total).fill(0);
  const emit = () => opts.onProgress?.(done.reduce((a, b) => a + b, 0) / total);

  const uploadPart = async (n: number) => {
    const blob = file.slice((n - 1) * init.partSize, Math.min(file.size, n * init.partSize));
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`/api/uploads/${init.uploadId}/parts/${n}?key=${encodeURIComponent(init.key)}`, {
          method: "PUT",
          headers: { "content-type": "application/octet-stream" },
          body: blob,
          signal: opts.signal,
        });
        if (!res.ok) throw await readError(res);
        parts.push(UploadedPart.parse(await res.json()));
        done[n - 1] = 1;
        emit();
        return;
      } catch (err) {
        lastErr = err;
        if (opts.signal?.aborted) throw err;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("No se pudo subir una parte del archivo");
  };

  try {
    let next = 1;
    const workers = Array.from({ length: Math.min(2, total) }, async () => {
      while (next <= total) {
        const n = next++;
        await uploadPart(n);
      }
    });
    await Promise.all(workers);
    const completeRes = await fetch(`/api/uploads/${init.uploadId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: init.key, parts }),
      signal: opts.signal,
    });
    if (!completeRes.ok) throw await readError(completeRes);
    return UploadCompleted.parse(await completeRes.json());
  } catch (err) {
    void fetch(`/api/uploads/${init.uploadId}?key=${encodeURIComponent(init.key)}`, { method: "DELETE" }).catch(() => undefined);
    throw err;
  }
}

export async function createCloudJob(req: CreateJobRequest): Promise<JobState> {
  const res = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
  if (!res.ok) throw await readError(res);
  return JobState.parse(await res.json());
}

export async function getCloudJob(id: string): Promise<JobState | null> {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) return null;
  return JobState.parse(await res.json());
}

export async function cancelCloudJob(id: string): Promise<void> {
  await fetch(`/api/jobs/${id}/cancel`, { method: "POST" }).catch(() => undefined);
}

export async function deleteCloudJob(id: string): Promise<void> {
  await fetch(`/api/jobs/${id}`, { method: "DELETE" }).catch(() => undefined);
}

/**
 * Sigue el estado del trabajo por WebSocket; si no hay conexión, sondea cada 3 s.
 * Devuelve una función para dejar de escuchar.
 */
export function watchCloudJob(id: string, onState: (state: JobState) => void): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const terminal = (s: JobState) => s.status === "done" || s.status === "failed" || s.status === "cancelled" || s.status === "expired";

  const handle = (raw: unknown) => {
    const parsed = JobState.safeParse(raw);
    if (!parsed.success) return;
    onState(parsed.data);
    if (terminal(parsed.data)) stop();
  };

  const startPolling = () => {
    if (pollTimer || stopped) return;
    pollTimer = setInterval(() => {
      void getCloudJob(id).then((s) => s && handle(s));
    }, 3000);
  };

  const connect = () => {
    if (stopped) return;
    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/api/jobs/${id}/ws`);
      ws.onmessage = (e) => {
        if (typeof e.data === "string" && e.data !== "pong") handle(JSON.parse(e.data) as unknown);
      };
      ws.onclose = () => {
        ws = null;
        if (!stopped) startPolling();
      };
      ws.onerror = () => ws?.close();
    } catch {
      startPolling();
    }
  };

  const stop = () => {
    stopped = true;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    ws = null;
  };

  connect();
  // Consulta inicial por si el WS tarda
  void getCloudJob(id).then((s) => s && handle(s));
  return stop;
}
