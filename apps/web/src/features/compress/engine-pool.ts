/**
 * Pool de workers del motor. Cada archivo vive en un worker concreto (el
 * documento abierto no puede moverse); el pool reparte archivos entre slots y
 * serializa las operaciones dentro de cada slot.
 */
import { createEngine, type EngineClient, type EngineHandle } from "@prensa/engine/client";

interface Slot {
  handle: EngineHandle | null;
  queue: Promise<unknown>;
  load: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export class EnginePool {
  private slots: Slot[];

  constructor(size: number) {
    this.slots = Array.from({ length: size }, () => ({ handle: null, queue: Promise.resolve(), load: 0 }));
  }

  get size(): number {
    return this.slots.length;
  }

  /** Elige el slot con menos archivos asignados. */
  assign(): number {
    let best = 0;
    for (let i = 1; i < this.slots.length; i++) {
      if (this.slots[i]!.load < this.slots[best]!.load) best = i;
    }
    this.slots[best]!.load++;
    return best;
  }

  release(slot: number): void {
    const s = this.slots[slot];
    if (s) s.load = Math.max(0, s.load - 1);
  }

  /** Ejecuta fn en el slot, en orden respecto a otras operaciones del mismo slot. */
  run<T>(slot: number, fn: (api: EngineClient) => Promise<T>): Promise<T> {
    const s = this.slots[slot];
    if (!s) return Promise.reject(new Error(`slot inválido: ${slot}`));
    const task = s.queue.then(
      () => fn(this.api(slot)),
      () => fn(this.api(slot)),
    );
    s.queue = task.catch(() => undefined);
    return task;
  }

  /** Mata el worker del slot (cancelación dura) y lo recrea perezosamente. */
  reset(slot: number): void {
    const s = this.slots[slot];
    if (!s?.handle) return;
    s.handle.terminate();
    s.handle = null;
    s.queue = Promise.resolve();
  }

  async warmup(): Promise<void> {
    await this.api(0).warmup();
  }

  private api(slot: number): EngineClient {
    const s = this.slots[slot]!;
    s.handle ??= createEngine();
    return s.handle.api;
  }
}

const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
export const pool = new EnginePool(clamp(cores - 1, 1, 3));
