/**
 * Cola FIFO global: arranca hasta MAX_RUNNING trabajos a la vez, uno por
 * contenedor, informa la posición en cola y vigila trabajos colgados.
 */
import { DurableObject } from "cloudflare:workers";
import type { RunJobPayload } from "@prensa/schema";
import { num, type Bindings } from "../env";

interface Running {
  startedAt: number;
}

const QUEUE_KEY = "queue";
const RUNNING_KEY = "running";
/** Sin progreso durante este tiempo → el trabajo se considera colgado (el runner hace heartbeat cada 60 s) */
const STALE_MS = 15 * 60 * 1000;
const TICK_MS = 60 * 1000;

export class SchedulerDO extends DurableObject<Bindings> {
  private async queue(): Promise<string[]> {
    return (await this.ctx.storage.get<string[]>(QUEUE_KEY)) ?? [];
  }
  private async running(): Promise<Record<string, Running>> {
    return (await this.ctx.storage.get<Record<string, Running>>(RUNNING_KEY)) ?? {};
  }

  async enqueue(jobId: string): Promise<number> {
    const q = await this.queue();
    if (!q.includes(jobId)) {
      q.push(jobId);
      await this.ctx.storage.put(QUEUE_KEY, q);
    }
    await this.tick();
    return (await this.queue()).indexOf(jobId) + 1;
  }

  async finished(jobId: string): Promise<void> {
    const running = await this.running();
    if (jobId in running) {
      delete running[jobId];
      await this.ctx.storage.put(RUNNING_KEY, running);
    }
    // El contenedor de este trabajo ya no hace falta: pararlo ahorra los minutos de inactividad.
    if (!this.env.ENGINE_DEV_URL) {
      this.ctx.waitUntil(this.env.ENGINE.get(this.env.ENGINE.idFromName(jobId)).stop().catch(() => undefined));
    }
    await this.tick();
  }

  async positionOf(jobId: string): Promise<number> {
    const q = await this.queue();
    const i = q.indexOf(jobId);
    return i >= 0 ? i + 1 : 0;
  }

  /** Cancela: si está en cola lo saca; si corre, avisa al contenedor. */
  async cancel(jobId: string): Promise<"dequeued" | "signalled" | "unknown"> {
    const q = await this.queue();
    const i = q.indexOf(jobId);
    if (i >= 0) {
      q.splice(i, 1);
      await this.ctx.storage.put(QUEUE_KEY, q);
      await this.tick();
      return "dequeued";
    }
    const running = await this.running();
    if (jobId in running) {
      try {
        await this.engineFetch(jobId, "/cancel", { jobId });
      } catch {
        /* el contenedor puede haber muerto: el watchdog lo limpia */
      }
      return "signalled";
    }
    return "unknown";
  }

  async tick(): Promise<void> {
    const max = num(this.env.MAX_RUNNING, 2);
    let q = await this.queue();
    const running = await this.running();
    let changed = false;
    while (Object.keys(running).length < max && q.length > 0) {
      const jobId = q.shift()!;
      running[jobId] = { startedAt: Date.now() };
      changed = true;
      this.ctx.waitUntil(this.start(jobId));
    }
    if (changed) {
      await this.ctx.storage.put(QUEUE_KEY, q);
      await this.ctx.storage.put(RUNNING_KEY, running);
    }
    // Posiciones visibles
    q = await this.queue();
    await Promise.all(q.map(async (id, i) => this.env.JOBS.get(this.env.JOBS.idFromName(id)).setPosition(i + 1)));
    if (Object.keys(running).length > 0 || q.length > 0) {
      const current = await this.ctx.storage.getAlarm();
      if (current == null) await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  private async start(jobId: string): Promise<void> {
    const job = this.env.JOBS.get(this.env.JOBS.idFromName(jobId));
    try {
      const [state, meta] = await Promise.all([job.get(), job.meta()]);
      if (!state || !meta || state.status !== "queued") {
        await this.finished(jobId);
        return;
      }
      await job.markRunning();
      const payload: RunJobPayload = {
        jobId,
        callbackUrl: meta.callbackUrl,
        inputKey: meta.inputKey,
        outputKey: meta.outputKey,
        fileName: state.fileName,
        inputSize: state.inputSize,
        spec: meta.spec,
      };
      // El primer arranque de un contenedor puede tardar (imagen grande): reintentar una vez.
      let res = await this.engineFetch(jobId, "/run", payload);
      if (!res.ok && res.status >= 500) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        console.error(`[scheduler] motor ${res.status} para ${jobId}: ${detail}`);
        await new Promise((r) => setTimeout(r, 15_000));
        res = await this.engineFetch(jobId, "/run", payload);
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        console.error(`[scheduler] motor ${res.status} para ${jobId}: ${detail}`);
        throw new Error(`motor respondió ${res.status}${detail ? `: ${detail}` : ""}`);
      }
    } catch (err) {
      await job.failed(`No se pudo iniciar el procesamiento: ${err instanceof Error ? err.message : String(err)}`);
      await this.finished(jobId);
    }
  }

  private async engineFetch(jobId: string, path: string, body: unknown): Promise<Response> {
    const init: RequestInit =
      body === undefined
        ? { method: "GET", headers: { authorization: `Bearer ${this.env.INTERNAL_SECRET}` } }
        : {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${this.env.INTERNAL_SECRET}` },
            body: JSON.stringify(body),
          };
    if (this.env.ENGINE_DEV_URL) return fetch(`${this.env.ENGINE_DEV_URL}${path}`, init);
    // Una instancia de contenedor por trabajo (aislamiento de memoria); max_instances limita la concurrencia.
    const container = this.env.ENGINE.get(this.env.ENGINE.idFromName(jobId));
    return container.fetch(new Request(`http://engine${path}`, init));
  }

  /** Watchdog: trabajos sin progreso reciente se marcan como fallidos y liberan el cupo. */
  override async alarm(): Promise<void> {
    const running = await this.running();
    let changed = false;
    for (const jobId of Object.keys(running)) {
      const job = this.env.JOBS.get(this.env.JOBS.idFromName(jobId));
      const state = await job.get();
      const last = state ? Date.parse(state.updatedAt) : 0;
      const terminal = !state || state.status === "done" || state.status === "failed" || state.status === "cancelled" || state.status === "expired";
      if (terminal) {
        delete running[jobId];
        changed = true;
      } else if (Date.now() - last > STALE_MS) {
        await job.failed("El procesamiento no respondió en 25 minutos y se canceló.");
        try {
          await this.engineFetch(jobId, "/cancel", { jobId });
        } catch {
          /* ignore */
        }
        delete running[jobId];
        changed = true;
      } else {
        // Mantener vivo el contenedor mientras el trabajo corre (sleepAfter cuenta
        // inactividad de peticiones, no de trabajo): un ping cada minuto.
        try {
          await this.engineFetch(jobId, "/health", undefined);
        } catch {
          /* el watchdog lo marcará si no responde en STALE_MS */
        }
      }
    }
    if (changed) await this.ctx.storage.put(RUNNING_KEY, running);
    await this.tick();
  }
}
