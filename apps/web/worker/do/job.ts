/**
 * Un Durable Object por trabajo: estado, progreso, WebSocket hacia la UI,
 * enlace de descarga firmado y borrado automático a las 24 h.
 */
import { DurableObject } from "cloudflare:workers";
import { JobState, type CompressionResult, type CompressionSpec, type Stage } from "@prensa/schema";
import { signDownload } from "../crypto";
import { nowIso, num, type Bindings } from "../env";

export interface JobMeta {
  inputKey: string;
  outputKey: string;
  spec: CompressionSpec;
  ip: string;
  /** Origen del Worker visto desde la petición que creó el trabajo */
  callbackUrl: string;
}

export interface JobInit {
  id: string;
  fileName: string;
  inputSize: number;
  inputKey: string;
  outputKey: string;
  spec: CompressionSpec;
  ip: string;
  callbackUrl: string;
}

const STATE_KEY = "state";
const META_KEY = "meta";

export class JobDO extends DurableObject<Bindings> {
  private async load(): Promise<JobState | null> {
    return (await this.ctx.storage.get<JobState>(STATE_KEY)) ?? null;
  }

  private async save(state: JobState): Promise<void> {
    state.updatedAt = nowIso();
    await this.ctx.storage.put(STATE_KEY, state);
    this.broadcast(state);
  }

  async init(input: JobInit): Promise<JobState> {
    const state: JobState = {
      id: input.id,
      status: "queued",
      position: null,
      stage: "queued",
      progress: 0,
      message: "En cola",
      fileName: input.fileName,
      outputName: null,
      inputSize: input.inputSize,
      result: null,
      downloadUrl: null,
      error: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      expiresAt: null,
    };
    const meta: JobMeta = { inputKey: input.inputKey, outputKey: input.outputKey, spec: input.spec, ip: input.ip, callbackUrl: input.callbackUrl };
    await this.ctx.storage.put(META_KEY, meta);
    await this.save(state);
    // Red de seguridad: si nada más lo expira, se borra en TTL + 2 h.
    await this.ctx.storage.setAlarm(Date.now() + (num(this.env.JOB_TTL_HOURS, 24) + 2) * 3600 * 1000);
    return state;
  }

  async get(): Promise<JobState | null> {
    return this.load();
  }

  async meta(): Promise<JobMeta | null> {
    return (await this.ctx.storage.get<JobMeta>(META_KEY)) ?? null;
  }

  async setPosition(position: number): Promise<void> {
    const s = await this.load();
    if (!s || s.status !== "queued") return;
    if (s.position === position) return;
    s.position = position;
    s.message = position > 0 ? `En cola · ${position}º` : "En cola";
    await this.save(s);
  }

  async markRunning(): Promise<void> {
    const s = await this.load();
    if (!s || s.status !== "queued") return;
    s.status = "running";
    s.position = 0;
    s.stage = "processing";
    s.progress = 0.01;
    s.message = "Iniciando";
    await this.save(s);
  }

  async progress(p: { stage: Stage; progress: number; message?: string }): Promise<void> {
    const s = await this.load();
    if (!s || s.status !== "running") return;
    s.stage = p.stage;
    s.progress = Math.max(0, Math.min(1, p.progress));
    s.message = p.message ?? s.message;
    await this.save(s);
  }

  async done(result: CompressionResult, outputKey: string, outputName: string): Promise<void> {
    const s = await this.load();
    if (!s || (s.status !== "running" && s.status !== "queued")) return;
    const ttlMs = num(this.env.JOB_TTL_HOURS, 24) * 3600 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    const token = await signDownload(this.env.INTERNAL_SECRET, s.id, Math.floor(expiresAt.getTime() / 1000));
    s.status = "done";
    s.stage = "done";
    s.progress = 1;
    s.message = "Listo";
    s.result = result;
    s.outputName = outputName;
    s.downloadUrl = `/api/jobs/${s.id}/download?t=${token}`;
    s.expiresAt = expiresAt.toISOString();
    await this.save(s);
    const meta = await this.meta();
    if (meta) {
      meta.outputKey = outputKey;
      await this.ctx.storage.put(META_KEY, meta);
      // El original ya no hace falta.
      this.ctx.waitUntil(this.env.FILES.delete(meta.inputKey).catch(() => undefined));
    }
    await this.ctx.storage.setAlarm(expiresAt.getTime());
  }

  async failed(error: string): Promise<void> {
    const s = await this.load();
    if (!s || s.status === "done" || s.status === "expired") return;
    const cancelled = error === "CANCELLED";
    s.status = cancelled ? "cancelled" : "failed";
    s.stage = null;
    s.message = cancelled ? "Cancelado" : "Error";
    s.error = cancelled ? null : error;
    await this.save(s);
    const meta = await this.meta();
    if (meta) this.ctx.waitUntil(this.env.FILES.delete(meta.inputKey).catch(() => undefined));
    // Estado consultable un rato; luego se limpia.
    await this.ctx.storage.setAlarm(Date.now() + 2 * 3600 * 1000);
  }

  /** Borra los archivos y deja el trabajo como expirado (botón "Eliminar ahora" o alarma). */
  async expire(): Promise<void> {
    const s = await this.load();
    const meta = await this.meta();
    if (meta) {
      await Promise.all([
        this.env.FILES.delete(meta.inputKey).catch(() => undefined),
        this.env.FILES.delete(meta.outputKey).catch(() => undefined),
      ]);
    }
    if (s) {
      s.status = "expired";
      s.downloadUrl = null;
      s.message = "Archivo eliminado";
      await this.save(s);
    }
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "expired");
      } catch {
        /* ya cerrado */
      }
    }
    await this.ctx.storage.deleteAlarm();
    // Conservamos el estado final poco tiempo para que la UI lo vea; después se vacía.
    await this.ctx.storage.setAlarm(Date.now() + 15 * 60 * 1000);
  }

  override async alarm(): Promise<void> {
    const s = await this.load();
    if (!s) return;
    if (s.status === "expired") {
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.expire();
  }

  /** WebSocket de progreso para la UI (API de hibernación: no cuesta mientras espera). */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const s = await this.load();
    if (s) server.send(JSON.stringify(s));
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === "ping") ws.send("pong");
  }

  override webSocketClose(ws: WebSocket): void {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }

  private broadcast(state: JobState): void {
    const payload = JSON.stringify(state);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        /* socket muerto */
      }
    }
  }
}

export function parseJobState(raw: unknown): JobState | null {
  const r = JobState.safeParse(raw);
  return r.success ? r.data : null;
}
